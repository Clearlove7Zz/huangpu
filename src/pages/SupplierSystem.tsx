import { useMemo, useState } from 'react';
import { Button, Card, Checkbox, Input, Table, Tag, Typography, Upload, message } from 'antd';
import { DownloadOutlined, InboxOutlined, SearchOutlined } from '@ant-design/icons';
import { SUPPLIER_DATA } from '../data/suppliers-data';

const { Title, Text } = Typography;

interface LaborSupplier {
  seq: number;
  name: string;
  legalPerson: string;
  controller: string;
  contact: string;
  phone: string;
  qualType: string;
  qualLevel: string;
  recommendDept: string;
  storage: string;
  remark: string;
  usage: string;
}

interface MaterialSupplier {
  seq: number;
  name: string;
  legalPerson: string;
  controller: string;
  contact: string;
  phone: string;
  supplyType: string;
  qualLevel: string;
  recommendDept: string;
  storage: string;
  remark: string;
}

const laborData = SUPPLIER_DATA.labor as LaborSupplier[];
const materialData = SUPPLIER_DATA.material as MaterialSupplier[];

export default function SupplierSystem() {
  const [search, setSearch] = useState('');
  const [editable, setEditable] = useState(true);

  const filteredLabor = useMemo(() => {
    const q = search.toLowerCase();
    return q ? laborData.filter((r) => `${r.name}${r.legalPerson}${r.contact}${r.phone}${r.qualType}`.toLowerCase().includes(q)) : laborData;
  }, [search]);

  const filteredMaterial = useMemo(() => {
    const q = search.toLowerCase();
    return q ? materialData.filter((r) => `${r.name}${r.legalPerson}${r.contact}${r.phone}${r.supplyType}`.toLowerCase().includes(q)) : materialData;
  }, [search]);

  const laborCols = [
    { title: '序号', dataIndex: 'seq', width: 64, align: 'center' as const },
    { title: '单位名称', dataIndex: 'name', width: 260, ellipsis: true, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '法人', dataIndex: 'legalPerson', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '实控老板', dataIndex: 'controller', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '联系人', dataIndex: 'contact', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '电话', dataIndex: 'phone', width: 130, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '资质类型', dataIndex: 'qualType', width: 200, ellipsis: true, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '资质等级', dataIndex: 'qualLevel', width: 90, render: (v: string) => <Tag color={v === '一级' ? 'success' : v === '二级' ? 'warning' : 'default'}>{v}</Tag> },
  ];

  const materialCols = [
    { title: '序号', dataIndex: 'seq', width: 64, align: 'center' as const },
    { title: '单位名称', dataIndex: 'name', width: 280, ellipsis: true, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '法人', dataIndex: 'legalPerson', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '实控老板', dataIndex: 'controller', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '联系人', dataIndex: 'contact', width: 100, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '电话', dataIndex: 'phone', width: 130, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '供应类型', dataIndex: 'supplyType', width: 200, ellipsis: true, render: (v: string) => editable ? <Input size="small" defaultValue={v} style={{ background: 'rgba(24,144,255,0.06)', borderColor: '#1890ff' }} /> : v },
    { title: '资质等级', dataIndex: 'qualLevel', width: 90 },
  ];

  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">供应商库</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>来源：附件6《黄埔项目群分供货商名录》· 专业劳务 {laborData.length} 家 · 材料设备 {materialData.length} 家</Text>
        </div>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => { message.success(`Excel导入：${file.name} · 自动校验完成`); return false; }}>
            <Button type="primary" size="small" icon={<InboxOutlined />}>Excel导入</Button>
          </Upload>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success('正在导出 供应商库 (Excel)')}>导出</Button>
          <Input
            prefix={<SearchOutlined style={{ color: 'rgba(31,35,40,0.35)' }} />}
            placeholder="搜索单位名称/产品/联系人..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Checkbox checked={editable} onChange={(e) => setEditable(e.target.checked)}>可编辑</Checkbox>
        </div>

        <Title level={5} style={{ marginBottom: 12, fontSize: 14 }}>专业劳务分供应商 ({filteredLabor.length})</Title>
        <Table
          rowKey="seq"
          size="small"
          pagination={false}
          columns={laborCols}
          dataSource={filteredLabor}
          scroll={{ x: 1050 }}
          style={{ marginBottom: 24 }}
        />

        <Title level={5} style={{ marginBottom: 12, fontSize: 14, borderTop: '1px solid #ececf0', paddingTop: 16 }}>材料设备供应商 ({filteredMaterial.length})</Title>
        <Table
          rowKey="seq"
          size="small"
          pagination={false}
          columns={materialCols}
          dataSource={filteredMaterial}
          scroll={{ x: 1050 }}
        />
      </Card>
    </div>
  );
}
