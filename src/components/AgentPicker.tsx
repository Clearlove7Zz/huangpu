import { CheckOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Dropdown, Space, Typography } from 'antd';

const { Text } = Typography;

export interface PickerAgent {
  id: string;
  name: string;
  description?: string;
  mode: string;
  builtin: boolean;
}

function getAgentDescription(agent: PickerAgent): string {
  if (agent.description) return agent.description;
  if (agent.id === 'builtin-smart-reasoning' || agent.name.includes('智能推理')) return '多步骤思考，深度分析';
  if (agent.id === 'builtin-data-analyst' || agent.name.includes('数据分析')) return '支持 CSV/Excel 数据查询和统计分析';
  if (agent.id === 'builtin-quick-answer' || agent.name.includes('快速')) return '基于知识库的快速问答';
  return agent.mode === 'agent' ? '多步骤思考，深度分析' : '基于知识库的智能问答';
}

export default function AgentPicker({
  agents,
  value,
  onChange,
  disabled,
}: {
  agents: PickerAgent[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const selected = agents.find((agent) => agent.id === value);
  return (
    <Dropdown
      trigger={['click']}
      disabled={disabled || agents.length === 0}
      menu={{
        items: agents.map((agent) => ({
          key: agent.id,
          icon: agent.id === value ? <CheckOutlined /> : <RobotOutlined />,
          label: (
            <div className="picker-option">
              <Text>{agent.name}</Text>
              <Text type="secondary">{getAgentDescription(agent)}</Text>
            </div>
          ),
          onClick: () => onChange(agent.id),
        })),
      }}
    >
      <Button type="text" className="workbench-pill" disabled={disabled}>
        <Space size={6}><RobotOutlined />{selected?.name ?? '选择智能体'}</Space>
      </Button>
    </Dropdown>
  );
}
