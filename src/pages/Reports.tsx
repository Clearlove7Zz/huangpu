import { useState } from 'react';
import { Button, Card, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

interface ReportItem {
  id: string;
  name: string;
  category: string;
  format: string[];
}

export default function Reports() {
  const reports = MOCK_DATA.reports as ReportItem[];
  const [category, setCategory] = useState('全部');

  const categories = ['全部', ...Array.from(new Set(reports.map((r) => r.category)))];

  const filtered = category === '全部' ? reports : reports.filter((r) => r.category === category);

  const categoryColor: Record<string, string> = { 沙盘: 'cyan', 成本: 'success', 财务: 'warning' };

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">报表中心</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {reports.length} 类报表 · 沙盘 / 成本 / 财务分类 · 周期报表 CSV 导出
          </Text>
        </div>
        <Segmented value={category} onChange={(v) => setCategory(String(v))} options={categories.map((c) => ({ value: c, label: c }))} />
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <Table
          rowKey="id"
          pagination={{ pageSize: 12 }}
          columns={[
            { title: '编号', dataIndex: 'id', width: 90 },
             { title: '报表名称', dataIndex: 'name', width: 260, ellipsis: true },
            { title: '分类', dataIndex: 'category', width: 90, render: (v: string) => <Tag color={categoryColor[v]}>{v}</Tag> },
            {
              title: '格式',
              dataIndex: 'format',
              width: 140,
              render: (v: string[]) => v.map((f) => <Tag key={f} color={f === 'Excel' ? 'success' : 'default'}>{f}</Tag>),
            },
            {
              title: '操作',
              width: 140,
              render: (_: unknown, r: ReportItem) => (
                <Space>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => message.success(`已生成 ${r.name}（演示：导出 CSV 逻辑可接入后端）`)}
                  >
                    导出
                  </Button>
                  <Button size="small" type="link" onClick={() => message.info(`RAG 报表解读将在二期接入：${r.name}`)}>
                    解读
                  </Button>
                </Space>
              ),
            },
          ]}
          dataSource={filtered}
        />
      </Card>
    </div>
  );
}
