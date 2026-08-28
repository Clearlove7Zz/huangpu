import { CloseOutlined, FileTextOutlined, LoadingOutlined, PaperClipOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';

const { Text } = Typography;

export interface AttachmentView {
  localId: string;
  remoteId?: string;
  name: string;
  size: number;
  status: string;
  progress?: number;
  error?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPreview({ files, onRemove, disabled }: { files: AttachmentView[]; onRemove: (id: string) => void; disabled?: boolean }) {
  if (files.length === 0) return null;
  return (
    <div className="attachment-preview-list">
      {files.map((file) => (
        <div className={`attachment-preview-item attachment-preview-${file.status}`} key={file.localId}>
          <span className="attachment-preview-icon"><FileTextOutlined /></span>
          <span className="attachment-preview-info">
            <Text ellipsis={{ tooltip: file.name }} className="attachment-preview-name">{file.name}</Text>
            <span className="attachment-preview-meta">
              {formatSize(file.size)} · {file.status === 'uploading' ? `上传中 ${file.progress ?? 0}%` : file.status === 'processing' || file.status === 'uploaded' ? '解析中' : file.status === 'ready' ? '已就绪' : file.error ?? '上传失败'}
            </span>
          </span>
          {file.status === 'uploading' || file.status === 'processing' || file.status === 'uploaded' ? <LoadingOutlined spin /> : file.status === 'ready' ? <Tag color="green">就绪</Tag> : <PaperClipOutlined />}
          <Button type="text" size="small" icon={<CloseOutlined />} aria-label={`移除 ${file.name}`} disabled={disabled} onClick={() => onRemove(file.localId)} />
        </div>
      ))}
    </div>
  );
}
