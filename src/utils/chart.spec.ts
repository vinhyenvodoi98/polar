import { IChart, IConfig } from '@mrblenny/react-flow-chart';
import { LightningNodeMapping } from 'store/models/lightning';
import { Network } from 'types';
import { defaultStateChannel, defaultStateInfo, getNetwork } from 'utils/tests';
import { initChartFromNetwork, snap, updateChartFromNodes } from './chart';

describe('Chart Util', () => {
  let network: Network;
  let chart: IChart;
  let nodesData: LightningNodeMapping;

  const addChannel = (node: string, remotePubkey: string, pending?: boolean) => {
    const { channels } = nodesData[node];
    if (channels) {
      channels.push(
        defaultStateChannel({
          pubkey: remotePubkey,
          uniqueId: 'xxxxxxxxxx:0',
          channelPoint: 'xxxxxxxxxxxxxxxx:0',
          capacity: '1000',
          localBalance: '400',
          remoteBalance: '600',
          status: pending ? 'Opening' : 'Open',
          pending,
        }),
      );
    }
  };

  beforeEach(() => {
    network = getNetwork();
    chart = initChartFromNetwork(network);
    nodesData = {
      [network.nodes.lightning[0].name]: {
        info: defaultStateInfo({ pubkey: 'ln1pubkey' }),
        channels: [],
      },
      [network.nodes.lightning[1].name]: {
        info: defaultStateInfo({ pubkey: 'ln2pubkey' }),
        channels: [],
      },
    };
  });

  describe('snap', () => {
    it('should snap position to a 20*20 grid', () => {
      const config = { snapToGrid: true } as IConfig;
      expect(snap({ x: 20, y: 20 }, config)).toEqual({ x: 20, y: 20 });
      expect(snap({ x: 21, y: 21 }, config)).toEqual({ x: 20, y: 20 });
      expect(snap({ x: 28, y: 28 }, config)).toEqual({ x: 20, y: 20 });
      expect(snap({ x: 31, y: 31 }, config)).toEqual({ x: 40, y: 40 });
      expect(snap({ x: 35, y: 35 }, config)).toEqual({ x: 40, y: 40 });
    });

    it('should not snap position', () => {
      expect(snap({ x: 20, y: 20 })).toEqual({ x: 20, y: 20 });
      expect(snap({ x: 21, y: 21 })).toEqual({ x: 21, y: 21 });
      expect(snap({ x: 31, y: 31 })).toEqual({ x: 31, y: 31 });
    });
  });

  describe('updateChartFromNetwork', () => {
    it('should create link for an open channel', () => {
      addChannel('alice', 'ln2pubkey');
      const result = updateChartFromNodes(chart, nodesData);
      expect(result.links['xxxxxxxxxx:0']).toBeDefined();
      const link = result.links['xxxxxxxxxx:0'];
      expect(link.from.nodeId).toBe('alice');
      expect(link.to.nodeId).toBe('bob');
      expect(link.properties.type).toBe('open-channel');
      expect(link.properties.status).toBe('Open');
      expect(link.properties.capacity).toBe('1000');
    });

    it('should create link for a pending channel', () => {
      addChannel('alice', 'ln2pubkey', true);
      const result = updateChartFromNodes(chart, nodesData);
      expect(result.links['xxxxxxxxxx:0']).toBeDefined();
      const link = result.links['xxxxxxxxxx:0'];
      expect(link.from.nodeId).toBe('alice');
      expect(link.to.nodeId).toBe('bob');
      expect(link.properties.type).toBe('pending-channel');
      expect(link.properties.status).toBe('Opening');
      expect(link.properties.capacity).toBe('1000');
    });

    it('should remove links for channels that do not exist', () => {
      addChannel('alice', 'ln2pubkey');
      const result = updateChartFromNodes(chart, nodesData);
      expect(result.links['xxxxxxxxxx:0']).toBeTruthy();
      // remove the channel
      const node = nodesData['alice'];
      if (node.channels) node.channels = [];
      const result2 = updateChartFromNodes(result, nodesData);
      expect(result2.links['xxxxxxxxxx:0']).toBeUndefined();
    });

    it('should make no changes if channels is undefined', () => {
      nodesData['alice'].channels = undefined;
      nodesData['bob'].channels = undefined;
      const result = updateChartFromNodes(chart, nodesData);
      expect(result).toEqual(chart);
    });

    it('should point link right to left', () => {
      chart.nodes['alice'].position.x = 200;
      chart.nodes['bob'].position.x = 100;
      addChannel('alice', 'ln2pubkey');
      const result = updateChartFromNodes(chart, nodesData);
      const link = result.links['xxxxxxxxxx:0'];
      expect(link.properties.direction).toEqual('rtl');
    });

    it('should update the node sizes', () => {
      chart.nodes['alice'].size = { width: 100, height: 20 };
      chart.nodes['bob'].size = undefined;
      addChannel('alice', 'ln2pubkey');
      const result = updateChartFromNodes(chart, nodesData);
      let size = result.nodes['alice'].size;
      expect(size).toBeDefined();
      if (size) expect(size.height).toBe(60);
      size = result.nodes['bob'].size;
      expect(size).toBeDefined();
      if (size) expect(size.height).toBe(60);
    });
  });
});
