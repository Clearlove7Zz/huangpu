import { useState } from 'react';
import { Button, Card, Table, Tag, Typography, Input } from 'antd';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;
const { TextArea } = Input;

const MENTION_USERS = ['@吴主任', '@艾经理', '@曹经理', '@王会计', '@宁总'];

export default function Coordination() {
  const [note, setNote] = useState('');

  const list = MOCK_DATA.coordination as {
    id: string;
    type: string;
    title: string;
    project: string;
    status: string;
    owner: string;
    deadline: string;
    mentions: string[];
    note: string;
  }[];

  const typeColor: Record<string, string> = {
    前期手续: 'cyan',
    党建联建: 'purple',
    应急事件: 'error',
    外部协调: 'processing',
  };

  const statusColor: Record<string, string> = {
    进行中: 'processing',
    已完成: 'success',
    已关闭: 'default',
    待启动: 'warning',
  };

  const appendMention = (m: string) => {
    setNote((prev) => (prev ? `${prev} ${m}` : m).trim());
  };

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">外协协调</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>前期手续 / 党建 / 应急 / 外部协调 · 事项跟踪 · 支持 @提醒相关同事</Text>
        </div>
        <Tag color="processing" style={{ padding: '4px 12px', borderRadius: 8 }}>
          在办 {list.filter((l) => l.status === '进行中' || l.status === '待启动').length} 项
        </Tag>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 16 }}>
        <div className="ds-card-title" style={{ marginBottom: 8 }}>新建/编辑事项 · @提醒</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {MENTION_USERS.map((u) => (
            <Button key={u} size="small" shape="round" onClick={() => appendMention(u)}>
              {u}
            </Button>
          ))}
        </div>
        <TextArea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="输入协调说明，可点击上方 @同事"
          style={{ borderRadius: 8 }}
        />
      </Card>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Table
          rowKey="id"
          pagination={false}
          columns={[
            { title: '编号', dataIndex: 'id', width: 100, fixed: 'left' as const },
            { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color={typeColor[v]}>{v}</Tag> },
            { title: '事项', dataIndex: 'title', width: 240, ellipsis: true },
            { title: '项目', dataIndex: 'project', width: 140 },
            { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag> },
            { title: '责任人', dataIndex: 'owner', width: 90 },
            { title: '期限', dataIndex: 'deadline', width: 110 },
            {
              title: '协作对象',
              dataIndex: 'mentions',
              width: 160,
              render: (v: string[]) => v.map((m) => <Tag key={m}>{m}</Tag>),
            },
            { title: '备注', dataIndex: 'note', width: 240, fixed: 'right' as const, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
          ]}
          dataSource={list}
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
}
