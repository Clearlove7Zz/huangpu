import ThinkingOrb, { type ThinkingOrbState } from './ThinkingOrb';

const STATUS_LABELS: Record<ThinkingOrbState, string> = {
  idle: '在线',
  understanding: '正在理解',
  searching: '正在检索',
  reading: '正在读取',
  organizing: '正在整理',
  generating: '正在生成',
  done: '已完成',
};

export default function AssistantStatus({
  state,
  detail,
  compact = false,
}: {
  state: ThinkingOrbState;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div className={`assistant-status ${compact ? 'assistant-status-compact' : ''} assistant-status-${state}`}>
      <ThinkingOrb state={state} size={compact ? 20 : 30} />
      <span className="assistant-status-copy">
        <span className="assistant-status-label">{STATUS_LABELS[state]}</span>
        {detail && <span className="assistant-status-detail">{detail}</span>}
      </span>
    </div>
  );
}
