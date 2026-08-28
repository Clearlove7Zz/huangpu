import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

export const CHART_COLORS = ['#f4a261', '#2ec4b6', '#d4a300', '#6b7280', '#e5484d', '#5a8a4a'];

interface ChartProps {
  option: EChartsOption;
  height?: number;
  style?: React.CSSProperties;
}

export default function Chart({ option, height = 260, style }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas', devicePixelRatio: window.devicePixelRatio || 2 });
    chartRef.current = chart;
    chart.setOption(option, true);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
    requestAnimationFrame(() => chartRef.current?.resize());
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height, ...style }} />;
}
