import { DownloadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import type { ArtifactMeta } from '../services/artifact-service';

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArtifactList({ artifacts, onDownload }: { artifacts: ArtifactMeta[]; onDownload: (artifact: ArtifactMeta) => void }) {
  if (!artifacts.length) return null;
  return (
    <div className="ai-artifact-list">
      <span className="ai-artifact-label">生成文件</span>
      {artifacts.map((artifact) => (
        <div className="ai-artifact-item" key={`${artifact.index}-${artifact.file_name}`}>
          <span className="ai-artifact-icon">{artifact.file_name.toLowerCase().endsWith('.xlsx') ? <FileExcelOutlined /> : <FileTextOutlined />}</span>
          <span className="ai-artifact-name">{artifact.file_name}</span>
          <Tag>{size(artifact.file_size)}</Tag>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => onDownload(artifact)}>下载</Button>
        </div>
      ))}
    </div>
  );
}
