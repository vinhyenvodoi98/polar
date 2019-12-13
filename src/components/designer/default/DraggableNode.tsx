import React from 'react';
import styled from '@emotion/styled';
import { REACT_FLOW_CHART } from '@mrblenny/react-flow-chart';

const Styled = {
  Node: styled.div`
    display: flex;
    justify-content: space-between;
    alignt-items: center;
    margin: 20px 0;
    padding: 10px 10px;
    border: 1px solid #e8e8e8;
    border-radius: 4px;
    box-shadow: 4px 2px 9px rgba(0, 0, 0, 0.1);
    cursor: move;
  `,
  Label: styled.span`
    flex: 1;
    padding-left: 10px;
    font-weight: bold;
  `,
  Desc: styled.sup`
    font-weight: normal;
    opacity: 0.7;
  `,
  Logo: styled.img`
    width: 24px;
    height: 24px;
  `,
};

interface Props {
  label: string;
  desc?: string;
  icon: string;
  properties: any;
}

const DraggableNode: React.FC<Props> = ({ label, desc, icon, properties }) => {
  return (
    <Styled.Node
      draggable
      onDragStart={event => {
        event.dataTransfer.setData(REACT_FLOW_CHART, JSON.stringify(properties));
      }}
    >
      <Styled.Label>
        {label} {desc && <Styled.Desc>{desc}</Styled.Desc>}
      </Styled.Label>
      <Styled.Logo src={icon} alt={label} />
    </Styled.Node>
  );
};

export default DraggableNode;
