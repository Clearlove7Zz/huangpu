import { CheckOutlined, SearchOutlined, SwapOutlined, BulbOutlined, LoadingOutlined } from '@ant-design/icons';

/** RAG 流水线步骤（照抄 WeKnora RagPipelineProgress 的卡片式步骤列表） */

export interface PipelineStep {
  id: string;
  title: string;
  /** running = 进行中（旋转动画），done = 完成（对勾），pending = 等待 */
  status: 'running' | 'done' | 'pending';
  summary?: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  query_understand: <BulbOutlined />,
  retrieval: <SearchOutlined />,
  rerank: <SwapOutlined />,
};

export default function RagPipeline({ steps, waitText }: { steps: PipelineStep[]; waitText?: string }) {
  return (
    <div className="rag-pipeline">
      {steps.map((step) => (
        <div key={step.id} className="rag-pipeline-step">
          <div className="rag-pipeline-branch" />
          <div className={`rag-pipeline-card ${step.status === 'running' ? 'is-running' : ''}`}>
            <div className="rag-pipeline-card-head">
              <span className="rag-pipeline-icon">
                {ICON_MAP[step.id] ?? <BulbOutlined />}
              </span>
              <span className={`rag-pipeline-name ${step.status === 'running' ? 'is-running' : ''}`}>
                {step.title}
              </span>
              <span className="rag-pipeline-status">
                {step.status === 'running' ? (
                  <LoadingOutlined spin />
                ) : step.status === 'done' ? (
                  <CheckOutlined style={{ color: '#0fae91' }} />
                ) : (
                  <span className="rag-pipeline-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
            </div>
            {step.summary && <div className="rag-pipeline-summary">{step.summary}</div>}
          </div>
        </div>
      ))}
      {waitText && (
        <div className="rag-pipeline-step">
          <div className="rag-pipeline-branch" />
          <div className="rag-pipeline-card is-running">
            <div className="rag-pipeline-card-head">
              <span className="rag-pipeline-icon">
                <BulbOutlined />
              </span>
              <span className="rag-pipeline-name is-running">{waitText}</span>
              <span className="rag-pipeline-status">
                <LoadingOutlined spin />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
