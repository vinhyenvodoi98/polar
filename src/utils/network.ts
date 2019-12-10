import { debug } from 'electron-log';
import { join } from 'path';
import detectPort from 'detect-port';
import {
  BitcoinNode,
  CLightningNode,
  CLightningVersion,
  CommonNode,
  LndNode,
  LndVersion,
  Status,
} from 'shared/types';
import { Network } from 'types';
import { networksPath, nodePath } from './config';
import { BasePorts } from './constants';
import { getName } from './names';
import { range } from './numbers';

export const getContainerName = (node: CommonNode) =>
  `polar-n${node.networkId}-${node.name}`;

const groupNodes = (network: Network) => {
  const { bitcoin, lightning } = network.nodes;
  return {
    bitcoind: bitcoin.filter(n => n.implementation === 'bitcoind') as BitcoinNode[],
    lnd: lightning.filter(n => n.implementation === 'LND') as LndNode[],
    clightning: lightning.filter(
      n => n.implementation === 'c-lightning',
    ) as CLightningNode[],
    eclair: lightning.filter(n => n.implementation === 'eclair'),
  };
};

// long path games
const getLndFilePaths = (name: string, network: Network) => {
  // returns /volumes/lnd/lnd-1
  const lndDataPath = (name: string) => nodePath(network, 'LND', name);
  // returns /volumes/lnd/lnd-1/tls.cert
  const lndCertPath = (name: string) => join(lndDataPath(name), 'tls.cert');
  // returns /data/chain/bitcoin/regtest
  const macaroonPath = join('data', 'chain', 'bitcoin', 'regtest');
  // returns /volumes/lnd/lnd-1/data/chain/bitcoin/regtest/admin.amacaroon
  const lndMacaroonPath = (name: string, macaroon: string) =>
    join(lndDataPath(name), macaroonPath, `${macaroon}.macaroon`);

  return {
    tlsCert: lndCertPath(name),
    adminMacaroon: lndMacaroonPath(name, 'admin'),
    readonlyMacaroon: lndMacaroonPath(name, 'readonly'),
  };
};

export const createLndNetworkNode = (
  network: Network,
  version: LndVersion,
  status = Status.Stopped,
): LndNode => {
  const { bitcoin, lightning } = network.nodes;
  const id = lightning.length ? Math.max(...lightning.map(n => n.id)) + 1 : 0;
  const name = getName(id);
  return {
    id,
    networkId: network.id,
    name: name,
    type: 'lightning',
    implementation: 'LND',
    version,
    status,
    // alternate between backend nodes
    backendName: bitcoin[id % bitcoin.length].name,
    paths: getLndFilePaths(name, network),
    ports: {
      rest: BasePorts.lnd.rest + id,
      grpc: BasePorts.lnd.grpc + id,
    },
  };
};

export const createCLightningNetworkNode = (
  network: Network,
  version: CLightningVersion,
  status = Status.Stopped,
): CLightningNode => {
  const { bitcoin, lightning } = network.nodes;
  const id = lightning.length ? Math.max(...lightning.map(n => n.id)) + 1 : 0;
  const name = getName(id);
  const path = nodePath(network, 'c-lightning', name);
  return {
    id,
    networkId: network.id,
    name: name,
    type: 'lightning',
    implementation: 'c-lightning',
    version,
    status,
    // alternate between backend nodes
    backendName: bitcoin[id % bitcoin.length].name,
    paths: {
      macaroon: join(path, 'rest-api', 'access.macaroon'),
    },
    ports: {
      rest: BasePorts.clightning.rest + id,
    },
  };
};

export const createBitcoindNetworkNode = (
  network: Network,
  status: Status,
): BitcoinNode => {
  const { bitcoin } = network.nodes;
  const id = bitcoin.length ? Math.max(...bitcoin.map(n => n.id)) + 1 : 0;
  const name = `backend${id + 1}`;
  return {
    id,
    networkId: network.id,
    name: name,
    type: 'bitcoin',
    implementation: 'bitcoind',
    version: '0.18.1',
    // peer with the prev bitcoin node
    peerNames: bitcoin.length ? [bitcoin[bitcoin.length - 1].name] : [],
    status,
    ports: { rpc: BasePorts.bitcoind.rest + id },
  };
};

export const createNetwork = (config: {
  id: number;
  name: string;
  lndNodes: number;
  clightningNodes: number;
  bitcoindNodes: number;
  status?: Status;
}): Network => {
  const { id, name, lndNodes, clightningNodes, bitcoindNodes } = config;
  // need explicit undefined check because Status.Starting is 0
  const status = config.status !== undefined ? config.status : Status.Stopped;

  const network: Network = {
    id: id,
    name,
    status,
    path: join(networksPath, id.toString()),
    nodes: {
      bitcoin: [],
      lightning: [],
    },
  };

  range(bitcoindNodes).forEach(() => {
    network.nodes.bitcoin.push(createBitcoindNetworkNode(network, status));
  });

  range(lndNodes).forEach(() => {
    network.nodes.lightning.push(
      createLndNetworkNode(network, LndVersion.latest, status),
    );
  });

  range(clightningNodes).forEach(() => {
    network.nodes.lightning.push(
      createCLightningNetworkNode(network, CLightningVersion.latest, status),
    );
  });

  return network;
};

/**
 * Returns the images needed to start a network that are not included in the list
 * of images already pulled
 * @param network the network to check
 * @param pulled the list of images already pulled
 */
export const getMissingImages = (network: Network, pulled: string[]): string[] => {
  const { bitcoin, lightning } = network.nodes;
  const neededImages = [...bitcoin, ...lightning].map(
    n => `${n.implementation.toLocaleLowerCase().replace(/-/g, '')}:${n.version}`,
  );
  // exclude images already pulled
  const missing = neededImages.filter(i => !pulled.includes(i));
  // filter out duplicates
  const unique = missing.filter((image, index) => missing.indexOf(image) === index);
  if (unique.length)
    debug(`The network '${network.name}' is missing docker images`, unique);
  return unique;
};

/**
 * Checks a range of port numbers to see if they are open on the current operating system.
 * Returns a new array of port numbers that are confirmed available
 * @param requestedPorts the ports to check for availability. ** must be in ascending order
 *
 * @example if port 10002 is in use
 * getOpenPortRange([10001, 10002, 10003]) -> [10001, 10004, 10005]
 */
export const getOpenPortRange = async (requestedPorts: number[]): Promise<number[]> => {
  const openPorts: number[] = [];

  for (let port of requestedPorts) {
    if (openPorts.length) {
      // adjust to check after the previous open port if necessary, since the last
      // open port may have increased
      const lastOpenPort = openPorts[openPorts.length - 1];
      if (port <= lastOpenPort) {
        port = lastOpenPort + 1;
      }
    }
    openPorts.push(await detectPort(port));
  }
  return openPorts;
};

export interface OpenPorts {
  [key: string]: {
    rpc?: number;
    grpc?: number;
    rest?: number;
  };
}

/**
 * Checks if the ports specified on the nodes are available on the host OS. If not,
 * return new ports that are confirmed available
 * @param network the network with nodes to verify ports of
 */
export const getOpenPorts = async (network: Network): Promise<OpenPorts | undefined> => {
  const ports: OpenPorts = {};

  // filter out nodes that are already started since their ports are in use by themselves
  const bitcoin = network.nodes.bitcoin.filter(n => n.status !== Status.Started);
  if (bitcoin.length) {
    const existingPorts = bitcoin.map(n => n.ports.rpc);
    const openPorts = await getOpenPortRange(existingPorts);
    if (openPorts.join() !== existingPorts.join()) {
      openPorts.forEach((port, index) => {
        ports[bitcoin[index].name] = { rpc: port };
      });
    }
  }

  let { lnd, clightning } = groupNodes(network);

  // filter out nodes that are already started since their ports are in use by themselves
  lnd = lnd.filter(n => n.status !== Status.Started);
  if (lnd.length) {
    let existingPorts = lnd.map(n => n.ports.grpc);
    let openPorts = await getOpenPortRange(existingPorts);
    if (openPorts.join() !== existingPorts.join()) {
      openPorts.forEach((port, index) => {
        ports[lnd[index].name] = { grpc: port };
      });
    }

    existingPorts = lnd.map(n => n.ports.rest);
    openPorts = await getOpenPortRange(existingPorts);
    if (openPorts.join() !== existingPorts.join()) {
      openPorts.forEach((port, index) => {
        ports[lnd[index].name] = {
          ...(ports[lnd[index].name] || {}),
          rest: port,
        };
      });
    }
  }

  clightning = clightning.filter(n => n.status !== Status.Started);
  if (clightning.length) {
    const existingPorts = clightning.map(n => n.ports.rest);
    const openPorts = await getOpenPortRange(existingPorts);
    if (openPorts.join() !== existingPorts.join()) {
      openPorts.forEach((port, index) => {
        ports[clightning[index].name] = { rest: port };
      });
    }
  }

  // return undefined if no ports where updated
  return Object.keys(ports).length > 0 ? ports : undefined;
};
