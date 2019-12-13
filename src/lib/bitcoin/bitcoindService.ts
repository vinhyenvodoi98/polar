import logger from 'electron-log';
import BitcoinCore from 'bitcoin-core';
import { BitcoinNode } from 'shared/types';
import { BitcoindLibrary } from 'types';
import { delay, waitFor } from 'utils/async';
import {
  bitcoinCredentials,
  COINBASE_MATURITY_DELAY,
  HALVING_INTERVAL,
  INITIAL_BLOCK_REWARD,
} from 'utils/constants';

class BitcoindService implements BitcoindLibrary {
  creatClient(node: BitcoinNode) {
    return new BitcoinCore({
      port: `${node.ports.rpc}`,
      username: bitcoinCredentials.user,
      password: bitcoinCredentials.pass,
      logger: logger as any,
    });
  }

  async getBlockchainInfo(node: BitcoinNode) {
    return await this.creatClient(node).getBlockchainInfo();
  }

  async getWalletInfo(node: BitcoinNode) {
    return await this.creatClient(node).getWalletInfo();
  }

  async connectPeers(node: BitcoinNode) {
    const client = this.creatClient(node);
    for (const peer of node.peers) {
      await client.addNode(peer, 'add');
    }
  }

  /**
   * Send an amount of bitcoin to an address
   * @param node the bitcoin node to communicate with
   * @param toAddress the destination wallet address to send funds to
   * @param amount the amount denominated in bitcoin
   */
  async sendFunds(node: BitcoinNode, toAddress: string, amount: number) {
    const client = this.creatClient(node);

    const { blocks } = await this.getBlockchainInfo(node);
    const { balance } = await client.getWalletInfo();
    // if the bitcoin node doesn't have enough coins then mine more
    if (balance <= amount) {
      await this.mineUntilMaturity(node);
      await this.mine(this.getBlocksToMine(blocks, amount - balance), node);
    }
    const txid = await client.sendToAddress(toAddress, amount);
    return txid;
  }

  async mine(numBlocks: number, node: BitcoinNode) {
    const client = this.creatClient(node);
    const addr = await client.getNewAddress();
    return await client.generateToAddress(numBlocks, addr);
  }

  /**
   * Helper function to continually query the bitcoind node until a successful
   * response is received or it times out
   */
  async waitUntilOnline(
    node: BitcoinNode,
    interval = 3 * 1000, // check every 3 seconds
    timeout = 30 * 1000, // timeout after 30 seconds
  ): Promise<void> {
    return waitFor(
      async () => {
        await this.getBlockchainInfo(node);
      },
      interval,
      timeout,
    );
  }

  /**
   * will mine up to block #100 if necessary in order for
   * fresh coins to be spendable
   */
  private async mineUntilMaturity(node: BitcoinNode) {
    // get all of this node's utxos
    const utxos = await this.creatClient(node).listTransactions();
    // determine the highest # of confirmations of all utxos. this is
    // the utxo we'd like to spend from
    const confs = Math.max(0, ...utxos.map(u => u.confirmations));
    const neededConfs = Math.max(0, COINBASE_MATURITY_DELAY - confs);
    if (neededConfs > 0) {
      await this.mine(neededConfs, node);
      // this may mines up to 100 blocks at once, so add a couple second
      // delay to allow the other nodes to process all of the new blocks
      await delay(2 * 1000);
    }
  }

  /**
   * Returns the number of blocks to mine in order to generate the desired
   * number of coins
   * @param height the current block height
   * @param desiredCoins the amount of coins to increase the balance by
   */
  private getBlocksToMine(height: number, desiredCoins: number): number {
    // the numeric halving period (1 for the first period with 50 btc reward)
    const halvingPeriod = Math.ceil(height / HALVING_INTERVAL);
    // the current block reward based on the halving period (50 -> 25 -> 12.5 -> etc)
    const currReward = INITIAL_BLOCK_REWARD / halvingPeriod;
    // the number of blocks needed to generate the desired coins, minimum of 1 block
    const numBlocks = desiredCoins < currReward ? 1 : desiredCoins / currReward;
    // round down to the nearest whole number
    return Math.floor(numBlocks);
  }
}

export default new BitcoindService();
