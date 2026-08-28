import { ThinkingOrb as ThinkingOrbCanvas, type OrbState } from 'thinking-orbs';

export type ThinkingOrbState = 'idle' | 'understanding' | 'searching' | 'reading' | 'organizing' | 'generating' | 'done';

const STATE_MAP: Record<ThinkingOrbState, OrbState> = {
  idle: 'breathing',
  understanding: 'listening',
  searching: 'searching',
  reading: 'working',
  organizing: 'weaving',
  generating: 'composing',
  done: 'shaping',
};

export default function ThinkingOrb({ state = 'idle', size = 64 }: { state?: ThinkingOrbState; size?: number }) {
  return (
    <ThinkingOrbCanvas
      state={STATE_MAP[state]}
      size={size >= 42 ? 64 : 20}
      theme="light"
      aria-label={state === 'done' ? '已完成' : '正在处理'}
    />
  );
}
