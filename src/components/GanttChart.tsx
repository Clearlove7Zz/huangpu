import { useMemo } from 'react';

const DAY_MS = 86400000;

export interface GanttActivity {
  id: string;
  wbs: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  isCritical?: boolean;
}

interface Range {
  min: Date;
  max: Date;
  totalDays: number;
}

function parseDate(s: string): Date | null {
  if (!s || s === '—') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

function getRange(activities: GanttActivity[]): Range {
  let min: Date | null = null;
  let max: Date | null = null;
  activities.forEach((a) => {
    const s = parseDate(a.start);
    const e = parseDate(a.end);
    if (s && (!min || s < min)) min = s;
    if (e && (!max || e > max)) max = e;
  });
  if (!min || !max) {
    min = new Date('2025-01-01');
    max = new Date('2028-01-01');
  }
  return { min, max, totalDays: daysBetween(min, max) };
}

function fmtMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthLabels(min: Date, max: Date): string[] {
  const labels: string[] = [];
  const cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) {
    labels.push(fmtMonth(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels.length ? labels : [fmtMonth(min)];
}

const BAR_COLORS: Record<string, string> = {
  done: '#52c41a',
  doing: '#1890ff',
  critical: '#fa8c16',
  pending: '#8c8c8c',
};

export default function GanttChart({ activities }: { activities: GanttActivity[] }) {
  const range = useMemo(() => getRange(activities), [activities]);
  const months = useMemo(() => buildMonthLabels(range.min, range.max), [range]);

  const today = new Date();
  const todayPct =
    today >= range.min && today <= range.max
      ? (((today.getTime() - range.min.getTime()) / DAY_MS / range.totalDays) * 100).toFixed(2)
      : null;

  return (
    <div style={{ minWidth: 720, fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 150px', gap: 8, alignItems: 'center' }}>
        <div style={{ padding: '8px 10px', fontWeight: 600, color: 'rgba(31,35,40,0.55)' }}>活动 / WBS</div>
        <div style={{ display: 'flex', gap: 4, padding: 8, color: 'rgba(31,35,40,0.55)', fontSize: 10, overflow: 'hidden' }}>
          {months.map((m) => (
            <span key={m} style={{ flex: 1, minWidth: 48, textAlign: 'center' }}>{m}</span>
          ))}
        </div>
        <div style={{ padding: '0 8px', fontWeight: 600, color: 'rgba(31,35,40,0.55)' }}>计划工期</div>
      </div>
      <div style={{ position: 'relative' }}>
        {todayPct != null && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `calc(220px + 8px + (100% - 228px - 150px) * ${Number(todayPct) / 100})`,
              width: 2,
              background: '#ff4d4f',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
        {activities.map((a) => {
          const s = parseDate(a.start);
          const e = parseDate(a.end);
          const left = s ? ((s.getTime() - range.min.getTime()) / DAY_MS / range.totalDays) * 100 : 0;
          const width = s && e ? (daysBetween(s, e) / range.totalDays) * 100 : 0;
          const colorKey = a.progress >= 100 ? 'done' : a.isCritical && a.progress < 100 ? 'critical' : a.progress > 0 ? 'doing' : 'pending';
          const indent = (a.wbs.match(/\./g) || []).length * 16;
          return (
            <div
              key={a.id}
              style={{ display: 'grid', gridTemplateColumns: '220px 1fr 150px', gap: 8, alignItems: 'center', borderBottom: '1px solid #f5f5f7' }}
            >
              <div
                style={{ padding: '8px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 12 + indent }}
                title={a.name}
              >
                <span style={{ color: '#1677ff', marginRight: 6 }}>{a.wbs}</span>
                {a.name}
                {a.isCritical && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(250,140,22,0.25)', color: '#fa8c16', marginLeft: 6 }}>
                    关键
                  </span>
                )}
              </div>
              <div style={{ position: 'relative', height: 28, background: '#fafafa', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    height: 20,
                    borderRadius: 3,
                    minWidth: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    left: `${Math.max(0, left).toFixed(2)}%`,
                    width: `${Math.min(100 - Math.max(0, left), width).toFixed(2)}%`,
                    background: BAR_COLORS[colorKey],
                    opacity: colorKey === 'pending' ? 0.6 : 1,
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 600 }}>{a.progress}%</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(31,35,40,0.55)', padding: '0 8px' }}>
                {a.start} ~ {a.end}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 11, color: 'rgba(31,35,40,0.55)' }}>
        <span><i style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, marginRight: 6, background: '#52c41a' }} />已完成</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, marginRight: 6, background: '#1890ff' }} />进行中</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, marginRight: 6, background: '#fa8c16' }} />关键路径</span>
        <span><i style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, marginRight: 6, background: '#8c8c8c', opacity: 0.6 }} />未开始</span>
        {todayPct != null && <span>｜ 竖线 = 今日</span>}
      </div>
    </div>
  );
}
