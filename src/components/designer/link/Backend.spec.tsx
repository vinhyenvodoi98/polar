import React from 'react';
import { render } from '@testing-library/react';
import { Status } from 'shared/types';
import { getNetwork } from 'utils/tests';
import Backend from './Backend';

describe('Backend component', () => {
  const renderComponent = () => {
    const network = getNetwork();
    const bitcoind = network.nodes.bitcoin[0];
    const lightning = network.nodes.lightning[0];
    const result = render(<Backend bitcoinNode={bitcoind} lightningNode={lightning} />);
    return {
      ...result,
      bitcoind,
      lightning,
    };
  };

  describe('Lightning Details', () => {
    it('should display Name', () => {
      const { getByText, lightning } = renderComponent();
      expect(getByText(lightning.name)).toBeInTheDocument();
    });

    it('should display Implementation', () => {
      const { getByText, getAllByText, lightning } = renderComponent();
      expect(getAllByText('Implementation')).toHaveLength(2);
      expect(getByText(lightning.implementation)).toBeInTheDocument();
    });

    it('should display Version', () => {
      const { getByText, getAllByText, lightning } = renderComponent();
      expect(getAllByText('Version')).toHaveLength(2);
      expect(getByText(`v${lightning.version}`)).toBeInTheDocument();
    });

    it('should display Status', () => {
      const { getAllByText, lightning } = renderComponent();
      expect(getAllByText('Status')).toHaveLength(2);
      expect(getAllByText(Status[lightning.status])).toHaveLength(2);
    });
  });

  describe('Bitcoind Details', () => {
    it('should display Name', () => {
      const { getByText, bitcoind } = renderComponent();
      expect(getByText(bitcoind.name)).toBeInTheDocument();
    });

    it('should display Implementation', () => {
      const { getByText, bitcoind } = renderComponent();
      expect(getByText(bitcoind.implementation)).toBeInTheDocument();
    });

    it('should display Version', () => {
      const { getByText, bitcoind } = renderComponent();
      expect(getByText(`v${bitcoind.version}`)).toBeInTheDocument();
    });
  });
});
