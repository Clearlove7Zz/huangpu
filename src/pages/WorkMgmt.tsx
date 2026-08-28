import { Button, Card, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

export default function WorkMgmt() {
  const data = MOCK_DATA.workManagement as {
    reports: { daily: { project: string; date: string; author: string; summary: string; status: string }[]; weekly: { project: string; period: string; author: string; summary: string; status: string }[]; monthly: { project: string; period: string; author: string; summary: string; status: string }[]; quarterly: { project: string; period: string; author: string; summary: string; status: string }[] };
    notifications: { subProject: string; title: string; occurDate: string; deadline: string; completeDate: string }[];
    regulations: { project: string; subItem: string; phase: string; type: string; name: string; revision: string; reason: string; effective: string; apply: string; approve: string; status: string }[];
  };

  const statusColor = (s: string) => (s === '已发布' ? 'success' : s === '已审核' ? 'processing' : s === '草稿' ? 'default' : 'warning');

  const reportTabs = [
    { key: 'daily', label: `日报 (${data.reports.daily.length})`, list: data.reports.daily, periodKey: 'date' as const },
    { key: 'weekly', label: `周报 (${data.reports.weekly.length})`, list: data.reports.weekly, periodKey: 'period' as const },
    { key: 'monthly', label: `月报 (${data.reports.monthly.length})`, list: data.reports.monthly, periodKey: 'period' as const },
    { key: 'quarterly', label: `季报 (${data.reports.quarterly.length})`, list: data.reports.quarterly, periodKey: 'period' as const },
  ] as { key: string; label: string; list: Record<string, unknown>[]; periodKey: 'date' | 'period' }[];

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">工作管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>项目汇报（日/周/月/季报）· 通知单 · 规章制度</Text>
        </div>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
          <span>项目汇报</span>
          <Button size="small" icon={<PlusOutlined />} onClick={() => message.success('添加汇报（Demo）')}>添加汇报</Button>
        </div>
        <Tabs
          items={reportTabs.map((t) => ({
            key: t.key,
            label: t.label,
            children: (
              <Table
                rowKey={(r) => `${r.project}-${r[t.periodKey]}`}
                pagination={false}
                columns={[
                  { title: '项目', dataIndex: 'project', width: 160 },
                  { title: '周期', dataIndex: t.periodKey, width: 120 },
                  { title: '编写人', dataIndex: 'author', width: 100 },
                  { title: '摘要', dataIndex: 'summary', width: 240, ellipsis: true },
                  { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColor(v)}>{v}</Tag> },
                ]}
                dataSource={t.list}
              />
            ),
          }))}
        />
      </Card>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
          <span>监理/建设方通知单</span>
          <Space>
            <Button size="small" onClick={() => message.success('获取数据（Demo）')}>获取数据</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => message.success('添加通知单（Demo）')}>添加</Button>
          </Space>
        </div>
        <Table
          rowKey="title"
          pagination={false}
          columns={[
            { title: '子项目', dataIndex: 'subProject', width: 150 },
            { title: '通知单', dataIndex: 'title', width: 260, ellipsis: true },
            { title: '发生日期', dataIndex: 'occurDate', width: 110 },
            { title: '回复期限', dataIndex: 'deadline', width: 110 },
            { title: '完成日期', dataIndex: 'completeDate', width: 110, render: (v: string) => (v ? <Tag color="success">已闭环</Tag> : <Tag color="warning">待回复</Tag>) },
            {
              title: '操作',
              width: 140,
              render: () => (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => message.success('查看（Demo）')}>查看</Button>
                  <Button type="link" size="small" onClick={() => message.success('修改（Demo）')}>修改</Button>
                  <Button type="link" size="small" danger onClick={() => message.success('删除（Demo）')}>删除</Button>
                </Space>
              ),
            },
          ]}
          dataSource={data.notifications}
        />
      </Card>

      <Card className="ds-card-line" style={{ marginTop: 16 }} styles={{ body: { padding: '16px 24px' } }}>
        <div className="ds-card-title" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
          <span>规章制度</span>
          <Button size="small" icon={<PlusOutlined />} onClick={() => message.success('添加制度（Demo）')}>添加制度</Button>
        </div>
        <Table
          rowKey="name"
          pagination={false}
          columns={[
            { title: '项目', dataIndex: 'project', width: 140 },
            { title: '制度类型', dataIndex: 'type', width: 120, render: (v: string) => <Tag color="cyan">{v}</Tag> },
            { title: '制度名称', dataIndex: 'name', width: 220, ellipsis: true },
            { title: '修订内容', dataIndex: 'revision', width: 280, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: '生效日期', dataIndex: 'effective', width: 100 },
            { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === '已生效' ? 'success' : 'warning'}>{v}</Tag> },
          ]}
          dataSource={data.regulations}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
}
