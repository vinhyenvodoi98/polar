import React, { useState } from 'react';
import { useAsyncCallback } from 'react-async-hook';
import styled from '@emotion/styled';
import { Button, Form, Input, InputNumber } from 'antd';
import { usePrefixedTranslation } from 'hooks';
import { BitcoinNode } from 'shared/types';
import { useStoreActions } from 'store';

const InputGroup = Input.Group;

const Styled = {
  InputNumber: styled(InputNumber)`
    width: 65%;
  `,
  Button: styled(Button)`
    width: 35%;
  `,
};

const MineBlocksInput: React.FC<{ node: BitcoinNode }> = ({ node }) => {
  const { l } = usePrefixedTranslation('cmps.designer.bitcoind.MineBlocksInput');
  const [value, setValue] = useState(6);
  const { notify } = useStoreActions(s => s.app);
  const { mine } = useStoreActions(s => s.bitcoind);
  const mineAsync = useAsyncCallback(async () => {
    try {
      await mine({ blocks: value, node });
    } catch (error) {
      notify({ message: l('error'), error });
    }
  });

  return (
    <>
      <Form.Item label={l('label')}>
        <InputGroup compact>
          <Styled.InputNumber
            value={value}
            min={1}
            max={1000}
            onChange={v => v && setValue(v)}
          />
          <Styled.Button
            onClick={mineAsync.execute}
            loading={mineAsync.loading}
            icon="tool"
          >
            {l('btn')}
          </Styled.Button>
        </InputGroup>
      </Form.Item>
    </>
  );
};

export default MineBlocksInput;
