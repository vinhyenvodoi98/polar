import { CLightningNode, LightningNode } from 'shared/types';
import * as PLN from 'lib/lightning/types';
import { LightningService } from 'types';
import { waitFor } from 'utils/async';
import { httpDelete, httpGet, httpPost } from './clightningApi';
import * as CLN from './types';

const ChannelStateToStatus: Record<
  CLN.ChannelState,
  PLN.LightningNodeChannel['status']
> = {
  CHANNELD_AWAITING_LOCKIN: 'Opening',
  CHANNELD_NORMAL: 'Open',
  CHANNELD_SHUTTING_DOWN: 'Closing',
  CLOSINGD_SIGEXCHANGE: 'Closing',
  CLOSINGD_COMPLETE: 'Waiting to Close',
  AWAITING_UNILATERAL: 'Force Closing',
  FUNDING_SPEND_SEEN: 'Waiting to Close',
  ONCHAIN: 'Closed',
  CLOSED: 'Closed',
};

class CLightningService implements LightningService {
  async getInfo(node: LightningNode): Promise<PLN.LightningNodeInfo> {
    const info = await httpGet<CLN.GetInfoResponse>(this.cast(node), 'getinfo');
    return {
      pubkey: info.id,
      alias: info.alias,
      rpcUrl: info.binding
        .filter(b => b.type === 'ipv4')
        .reduce((v, b) => `${info.id}@${b.address}:${b.port}`, ''),
      syncedToChain: !info.warningBitcoindSync && !info.warningLightningdSync,
      blockHeight: info.blockheight,
      numActiveChannels: info.numActiveChannels,
      numPendingChannels: info.numPendingChannels,
      numInactiveChannels: info.numInactiveChannels,
    };
  }

  async getBalances(node: LightningNode): Promise<PLN.LightningNodeBalances> {
    const balances = await httpGet<CLN.GetBalanceResponse>(this.cast(node), 'getBalance');
    return {
      total: balances.totalBalance.toString(),
      confirmed: balances.confBalance.toString(),
      unconfirmed: balances.unconfBalance.toString(),
    };
  }

  async getNewAddress(node: LightningNode): Promise<PLN.LightningNodeAddress> {
    return await httpGet<PLN.LightningNodeAddress>(this.cast(node), 'newaddr');
  }

  async getChannels(node: LightningNode): Promise<PLN.LightningNodeChannel[]> {
    const { pubkey } = await this.getInfo(node);
    const channels = await httpGet<CLN.GetChannelsResponse[]>(
      this.cast(node),
      'channel/listChannels',
    );
    return (
      channels
        // only include the channels that were initiated by this node
        .filter(chan => chan.fundingAllocationMsat[pubkey] > 0)
        .filter(c => ChannelStateToStatus[c.state] !== 'Closed')
        .map(c => {
          const status = ChannelStateToStatus[c.state];
          return {
            pending: status !== 'Open',
            uniqueId: c.fundingTxid.slice(-12),
            channelPoint: c.channelId,
            pubkey: c.id,
            capacity: this.toSats(c.msatoshiTotal),
            localBalance: this.toSats(c.msatoshiToUs),
            remoteBalance: this.toSats(c.msatoshiTotal - c.msatoshiToUs),
            status,
          };
        })
    );
  }

  async getPeers(node: LightningNode): Promise<PLN.LightningNodePeer[]> {
    const peers = await httpGet<CLN.Peer[]>(this.cast(node), 'peer/listPeers');
    return peers
      .filter(p => p.connected)
      .map(p => ({
        pubkey: p.id,
        address: (p.netaddr && p.netaddr[0]) || '',
      }));
  }

  async connectPeer(node: LightningNode, toRpcUrl: string): Promise<void> {
    const body = { id: toRpcUrl };
    await httpPost<{ id: string }>(this.cast(node), 'peer/connect', body);
  }

  async openChannel(
    from: LightningNode,
    toRpcUrl: string,
    amount: string,
  ): Promise<PLN.LightningNodeChannelPoint> {
    // get peers of source node
    const clnFrom = this.cast(from);
    const peers = await this.getPeers(clnFrom);

    // get pubkey of dest node
    const [toPubKey] = toRpcUrl.split('@');
    // add peer if not connected
    if (!peers.some(p => p.pubkey === toPubKey)) {
      await this.connectPeer(clnFrom, toRpcUrl);
    }

    // open the channel
    const body: CLN.OpenChannelRequest = {
      id: toPubKey,
      satoshis: amount,
      feeRate: '253perkw', // min relay fee for bitcoind
    };
    const res = await httpPost<CLN.OpenChannelResponse>(
      this.cast(from),
      'channel/openChannel',
      body,
    );

    return {
      txid: res.txid,
      // c-lightning doesn't return the output index. hard-code to 0
      index: 0,
    };
  }

  async closeChannel(node: LightningNode, channelPoint: string): Promise<any> {
    return await httpDelete<CLN.CloseChannelResponse>(
      this.cast(node),
      `channel/closeChannel/${channelPoint}`,
    );
  }

  async createInvoice(
    node: LightningNode,
    amount: number,
    memo?: string,
  ): Promise<string> {
    const body: CLN.InvoiceRequest = {
      amount: amount * 1000,
      label: new Date().getTime().toString(),
      description: memo || `Polar Invoice for ${node.name}`,
    };

    const res = await httpPost<CLN.InvoiceResponse>(
      this.cast(node),
      'invoice/genInvoice',
      body,
    );

    return res.bolt11;
  }

  async payInvoice(
    node: LightningNode,
    invoice: string,
    amount?: number,
  ): Promise<PLN.LightningNodePayReceipt> {
    const body: CLN.PayRequest = { invoice, amount };

    const res = await httpPost<CLN.PayResponse>(this.cast(node), 'pay', body);

    return {
      preimage: res.paymentPreimage,
      amount: res.msatoshi / 1000,
      destination: res.destination,
    };
  }

  /**
   * Helper function to continually query the node until a successful
   * response is received or it times out
   */
  async waitUntilOnline(
    node: LightningNode,
    interval = 3 * 1000, // check every 3 seconds
    timeout = 30 * 1000, // timeout after 30 seconds
  ): Promise<void> {
    return waitFor(
      async () => {
        await this.getInfo(node);
      },
      interval,
      timeout,
    );
  }

  private toSats(msats: number): string {
    return (msats / 1000).toFixed(0).toString();
  }

  private cast(node: LightningNode): CLightningNode {
    if (node.implementation !== 'c-lightning')
      throw new Error(
        `ClightningService cannot be used for '${node.implementation}' nodes`,
      );

    return node as CLightningNode;
  }
}

export default new CLightningService();
