import React from 'react';
import styled from '@emotion/styled';
import { Icon, Tooltip } from 'antd';
import { usePrefixedTranslation } from 'hooks';
import { BitcoinNode, Status } from 'shared/types';
import { useStoreActions } from 'store';
import { bitcoinCredentials } from 'utils/constants';
import { CopyIcon, DetailsList } from 'components/common';
import { DetailValues } from 'components/common/DetailsList';

const Styled = {
  Link: styled.a`
    margin-left: 10px;
    color: inherit;
    &:hover {
      opacity: 1;
    }
  `,
  Icon: styled(Icon)`
    margin-left: 5px;
    color: #aaa;
  `,
};

interface Props {
  node: BitcoinNode;
}

const ConnectTab: React.FC<Props> = ({ node }) => {
  const { l } = usePrefixedTranslation('cmps.designer.bitcoind.ConnectTab');
  const { openInBrowser } = useStoreActions(s => s.app);

  if (node.status !== Status.Started) {
    return <>{l('notStarted')}</>;
  }

  const details: DetailValues = [
    { label: l('rpcHost'), value: `http://127.0.0.1:${node.ports.rpc}` },
    { label: l('rpcUser'), value: bitcoinCredentials.user },
    { label: l('rpcPass'), value: bitcoinCredentials.pass },
  ].map(({ label, value }) => ({
    label,
    value: <CopyIcon label={label} value={value} text={value} />,
  }));

  const restDocsUrl =
    'https://bitcoin.org/en/developer-reference#remote-procedure-calls-rpcs';
  details.push({
    label: l('apiDocs'),
    value: (
      <>
        <Tooltip title={restDocsUrl}>
          <Styled.Link onClick={() => openInBrowser(restDocsUrl)}>REST</Styled.Link>
        </Tooltip>
        <Styled.Icon type="book" />
      </>
    ),
  });

  return (
    <>
      <DetailsList details={details} />
    </>
  );
};

export default ConnectTab;
