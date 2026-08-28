import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { TreeDataNode, UploadProps } from 'antd';
import { RAG_CONFIG, ragReady } from '../config/rag-config';
import {
  deleteKnowledge,
  deleteKnowledgeBase,
  listKnowledge,
  listKnowledgeBases,
  moveKnowledgeAcrossKb,
  parseStatusMeta,
  previewKnowledge,
  renameKnowledgeBase,
  uploadKnowledgeFile,
} from '../services/kb-service';
import type { KbFileInfo, KbInfo } from '../services/kb-service';
import MOCK_DATA from '../data';

const { Title, Text } = Typography;

const TYPE_ICON: Record<string, string> = {
  pdf: '📕',
  docx: '📘',
  doc: '📘',
  md: '📄',
  markdown: '📄',
  txt: '📃',
  xlsx: '📗',
  csv: '📗',
  pptx: '📙',
  html: '🌐',
  json: '🧾',
  jpg: '🖼️',
  png: '🖼️',
};

function fmtSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function Documents() {
  const connected = ragReady();

  // —— 真实模式状态 ——
  const [kbs, setKbs] = useState<KbInfo[]>([]);
  const [kbId, setKbId] = useState('');
  const [files, setFiles] = useState<KbFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<KbInfo | null>(null);
  const [renameName, setRenameName] = useState('');
  const [moveTarget, setMoveTarget] = useState<KbFileInfo | null>(null);
  const [moveToKb, setMoveToKb] = useState('');

  // —— 降级模式（demo）——
  const demoData = MOCK_DATA.documentManagement as {
    folders: { id: string; name: string; children?: { id: string; name: string }[] }[];
    files: { name: string; type: string; version: string; size: string; modifier: string; time: string }[];
  };

  const loadKbs = useCallback(async () => {
    if (!ragReady()) return;
    try {
      const list = await listKnowledgeBases();
      setKbs(list);
      setKbId((cur) => {
        if (cur && list.some((kb) => kb.id === cur)) return cur;
        return list.length ? list[0].id : '';
      });
    } catch {
      message.warning('文件夹列表加载失败');
    }
  }, []);

  const loadFiles = useCallback(async () => {
    if (!ragReady() || !kbId) return;
    setLoading(true);
    try {
      const res = await listKnowledge(kbId);
      setFiles(res.items);
    } catch {
      message.warning('文件加载失败');
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    void loadKbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (connected && kbId) void loadFiles();
  }, [connected, kbId, loadFiles]);

  const refreshAll = () => {
    void loadKbs();
    void loadFiles();
  };

  const handleUpload: UploadProps['beforeUpload'] = async (file) => {
    if (!kbId) {
      message.warning('请先选择文件夹');
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      await uploadKnowledgeFile(kbId, file);
      message.success(`「${file.name}」已上传到「${kbs.find((k) => k.id === kbId)?.name}」，正在解析入库…`);
      await loadFiles();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    try {
      await renameKnowledgeBase(renameTarget.id, name);
      message.success('已重命名');
      setRenameTarget(null);
      await loadKbs();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重命名失败');
    }
  };

  const handleDeleteKb = (kb: KbInfo) => {
    Modal.confirm({
      title: '删除文件夹',
      content: `确认删除「${kb.name}」？该文件夹下的所有文件将一并删除，AI 问答将无法检索到它们。此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteKnowledgeBase(kb.id);
          message.success('已删除');
          if (kbId === kb.id) setKbId('');
          await loadKbs();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const handleDeleteFile = (item: KbFileInfo) => {
    Modal.confirm({
      title: '删除知识',
      content: `确认删除「${item.name}」？删除后 AI 问答将无法检索到该文档。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteKnowledge(item.id);
          message.success('已删除');
          await loadFiles();
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const handlePreview = async (item: KbFileInfo) => {
    try {
      const text = await previewKnowledge(item.id);
      setPreviewTitle(item.name);
      setPreviewText(text.slice(0, 20000));
      setPreviewOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '预览失败（该类型暂不支持文本预览）');
    }
  };

  const confirmMove = async () => {
    if (!moveTarget) return;
    if (!moveToKb) {
      message.warning('请选择目标文件夹');
      return;
    }
    if (moveToKb === kbId) {
      message.info('文件已在该文件夹中');
      return;
    }
    try {
      await moveKnowledgeAcrossKb(kbId, moveToKb, [moveTarget.id]);
      message.success(`已迁移到「${kbs.find((k) => k.id === moveToKb)?.name}」`);
      setMoveTarget(null);
      await loadFiles();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '移动失败');
    }
  };

  const treeData: TreeDataNode[] = useMemo(
    () => kbs.map((kb) => ({ key: kb.id, title: kb.name })),
    [kbs],
  );

  const filtered = useMemo(
    () => (keyword ? files.filter((f) => f.name.includes(keyword)) : files),
    [files, keyword],
  );

  // —— 降级模式渲染：demo 数据 ——
  if (!connected) {
    return (
      <div>
        <div className="ds-page-header">
          <div>
            <Title level={4} className="ds-page-title">文档管理</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>合同 / 三会 / 设计 / 运营 / 建设期资料 · 版本与权限管理</Text>
          </div>
          <Tag color="warning" style={{ borderRadius: 8 }}>服务未连接 · 演示数据</Tag>
        </div>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12 }}
          message="连接 RAG 服务后，本页将支持按文件夹管理文档：上传即入库、删除即出库，AI 问答同步可检索。"
        />
        <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
          <Table
            rowKey="name"
            pagination={false}
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                render: (v: string, r: { type: string }) => (
                  <Space>
                    {r.type === 'folder' ? <FolderOutlined style={{ color: '#f4a261' }} /> : <FileOutlined style={{ color: '#2ec4b6' }} />}
                    <Text style={{ fontSize: 13 }}>{v}</Text>
                  </Space>
                ),
              },
              { title: '类型', dataIndex: 'type', width: 90, render: (v: string) => <Tag color={v === 'folder' ? 'warning' : 'cyan'}>{v === 'folder' ? '文件夹' : '文件'}</Tag> },
              { title: '版本', dataIndex: 'version', width: 80 },
              { title: '大小', dataIndex: 'size', width: 100 },
              { title: '修改人', dataIndex: 'modifier', width: 100 },
              { title: '修改时间', dataIndex: 'time', width: 160 },
            ]}
            dataSource={demoData.files}
          />
        </Card>
      </div>
    );
  }

  // —— 真实模式：知识库树（文件夹 = 知识库） ——
  return (
    <div>
      <div className="ds-page-header">
        <div>
          <Title level={4} className="ds-page-title">文档管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            按文件夹管理文档 · 上传即入库，AI 问答同步可检索
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading}>
            刷新
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => {
            const host = window.location.hostname;
            const url = host.endsWith('.trycloudflare.com') || host.endsWith('.ngrok.io') || host.endsWith('.cpolar.io')
              ? RAG_CONFIG.adminUrl
              : `http://${host}`;
            window.open(url, '_blank');
          }}>
            管理知识库
          </Button>
          <Upload beforeUpload={handleUpload} showUploadList={false} multiple={false}>
            <Button type="primary" icon={<CloudUploadOutlined />} loading={uploading}>
              上传到当前文件夹
            </Button>
          </Upload>
        </Space>
      </div>

      <Card className="ds-card-line" styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 24 }}>
          {/* 左侧知识库树 */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid #ececf0',
              paddingRight: 8,
            }}
          >
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>文件夹</Text>
            <Tree
              blockNode
              treeData={treeData}
              selectedKeys={kbId ? [kbId] : []}
              onSelect={(keys) => {
                if (keys.length) setKbId(String(keys[0]));
              }}
              titleRender={(node) => {
                const kb = kbs.find((k) => k.id === node.key);
                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      paddingRight: 4,
                      width: '100%',
                    }}
                  >
                    <Space size={4} style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <FolderOutlined style={{ color: '#f4a261' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kb?.name ?? '未知'}</span>
                    </Space>
                    {kb && (
                      <Space size={0} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          aria-label="重命名"
                          onClick={() => {
                            setRenameTarget(kb);
                            setRenameName(kb.name);
                          }}
                        />
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label="删除"
                          onClick={() => handleDeleteKb(kb)}
                        />
                      </Space>
                    )}
                  </div>
                );
              }}
            />
            {kbs.length === 0 && <Empty description="暂无文件夹，请到管理后台创建后刷新" imageStyle={{ height: 48 }} />}
          </div>

          {/* 右侧文件表格 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>{kbs.find((k) => k.id === kbId)?.name ?? '选择文件夹'}</Text>
                <Tag color="processing">{filtered.length} 个文件</Tag>
                <Tag color="success">{files.filter((f) => parseStatusMeta(f.parseStatus).label === '已入库').length} 个已入库</Tag>
              </Space>
              <Input
                allowClear
                variant="filled"
                prefix={<SearchOutlined />}
                placeholder="搜索文件名"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 200 }}
              />
            </div>

            <Table
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 12, showTotal: (t) => `共 ${t} 个文件` }}
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                   width: 260,
                  render: (v: string, r: KbFileInfo) => (
                    <Space>
                      <span>{TYPE_ICON[r.fileType] ?? '📄'}</span>
                      <Text style={{ fontSize: 13 }}>{v}</Text>
                    </Space>
                  ),
                },
                { title: '类型', dataIndex: 'fileType', width: 70, render: (v: string) => <Tag>{v || '—'}</Tag> },
                { title: '大小', dataIndex: 'fileSize', width: 90, align: 'right' as const, render: (v: number) => <span className="ds-num">{fmtSize(v)}</span> },
                {
                  title: '解析状态',
                  dataIndex: 'parseStatus',
                  width: 100,
                  render: (v: string) => {
                    const meta = parseStatusMeta(v);
                    return <Tag color={meta.color}>{meta.label}</Tag>;
                  },
                },
                {
                  title: '更新时间',
                  dataIndex: 'updatedAt',
                   width: 150,
                  render: (v: string) => <Text style={{ fontSize: 12 }}>{v ? v.slice(0, 16) : '—'}</Text>,
                },
                {
                  title: '操作',
                  width: 150,
                  fixed: 'right' as const,
                  render: (_: unknown, r: KbFileInfo) => (
                    <Space size={6}>
                      <Button type="link" size="small" onClick={() => void handlePreview(r)}>
                        预览
                      </Button>
                      <Button type="link" size="small" onClick={() => setMoveTarget(r)}>
                        移动
                      </Button>
                      <Button type="link" size="small" danger onClick={() => handleDeleteFile(r)}>
                        删除
                      </Button>
                    </Space>
                  ),
                },
              ]}
              dataSource={filtered}
              locale={{ emptyText: <Empty description="该文件夹暂无文件，点击右上角上传" /> }}
            />
          </div>
        </div>
      </Card>

      {/* 重命名 */}
      <Modal
        title="重命名文件夹"
        open={Boolean(renameTarget)}
        onCancel={() => setRenameTarget(null)}
        onOk={() => void handleRename()}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="输入新名称"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={() => void handleRename()}
        />
      </Modal>

      {/* 预览 */}
      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
      >
        <pre style={{ fontSize: 12, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {previewText}
        </pre>
      </Modal>

      {/* 跨库移动 */}
      <Modal
        title={moveTarget ? `移动「${moveTarget.name}」` : '移动文件'}
        open={Boolean(moveTarget)}
        onCancel={() => setMoveTarget(null)}
        onOk={() => void confirmMove()}
        okText="移动"
        cancelText="取消"
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          选择目标文件夹，文件将迁移过去
        </Text>
        <Select
          value={moveToKb}
          onChange={setMoveToKb}
          style={{ width: '100%' }}
          placeholder="选择目标文件夹"
          options={kbs
            .filter((k) => k.id !== kbId)
            .map((k) => ({ value: k.id, label: k.name }))}
        />
      </Modal>
    </div>
  );
}
