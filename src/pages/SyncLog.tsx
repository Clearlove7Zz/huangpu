import { Card, Space, Table, Tag, Typography } from 'antd';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

export default function SyncLog() {
  const logs = MOCK_DATA.syncLogs as { system: string; time: string; status: string; records: number; method: string }[];

  const statusTag: Record<string, { color: string; label: string }> = {
    success: { color: 'success', label: '同步成功' },
    warning: { color: 'warning', label: '接口对接中' },
    error: { color: 'error', label: '同步失败' },
  };

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">数据同步日志</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>各来源同步时间 / 方式 / 状态 / 记录数</Text>
        </div>
        <Tag color="processing" style={{ padding: '4px 12px', borderRadius: 8 }}>
          最近同步：{logs[0]?.time}
        </Tag>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Table
          rowKey="system"
          pagination={false}
          columns={[
            { title: '数据来源', dataIndex: 'system', width: 200, render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
            { title: '同步时间', dataIndex: 'time', width: 180 },
            { title: '状态', dataIndex: 'status', width: 130, render: (v: string) => <Tag color={statusTag[v]?.color}>{statusTag[v]?.label}</Tag> },
            { title: '记录数', dataIndex: 'records', width: 100, align: 'right', className: 'ds-num' },
             { title: '同步方式', dataIndex: 'method', width: 220, ellipsis: true },
          ]}
          dataSource={logs}
        />
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
          <Text strong>三期数据流转：</Text>
          <Space direction="vertical" size={4} style={{ marginTop: 8, width: '100%' }}>
            <div>
              <Tag color="processing" style={{ marginRight: 8 }}>录入层</Tag>
              <Text style={{ color: 'rgba(31, 35, 40, 0.72)' }}>施工管理平台 · 供应商平台 · 质检安全部门 · 成本测算系统 —— 唯一录入源</Text>
            </div>
            <div>
              <Tag color="warning" style={{ marginRight: 8 }}>同步层</Tag>
              <Text style={{ color: 'rgba(31, 35, 40, 0.72)' }}>标准接口 · Excel 模板导入 · 图片识别(OCR) · 自动生成历史数据</Text>
            </div>
            <div>
              <Tag color="success" style={{ marginRight: 8 }}>展示层</Tag>
              <Text style={{ color: 'rgba(31, 35, 40, 0.72)' }}>数字沙盘化呈现 · 详情穿透 · 原始数据可查 —— 展示层禁止手动录入</Text>
            </div>
          </Space>
        </div>
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
          <Text strong>二期规划：</Text>
          <Text style={{ color: 'rgba(31, 35, 40, 0.72)' }}>
            Jarvis BIM 接口对接中；真实业务系统接入后，本页将展示全量同步链路与数据血缘，并支持一键重同步。
          </Text>
        </div>
      </Card>
    </div>
  );
}
