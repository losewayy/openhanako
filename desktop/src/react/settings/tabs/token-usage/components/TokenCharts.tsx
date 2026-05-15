import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { formatCompact } from '../utils/formatNumber';
import styles from '../../../Settings.module.css';

interface RawRecord {
  date: string;
  provider_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
}

interface TokenChartsProps {
  records: RawRecord[];
  startDate: string;
  endDate: string;
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains('dark')
    || window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function formatDateLabel(dateStr: string, crossesYear: boolean): string {
  const d = new Date(dateStr);
  return crossesYear
    ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidDateStr(s: string): boolean {
  return /^d{4}-d{2}-d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

function fillDateRange(start: string, end: string): string[] {
  const result: string[] = [];
  if (!isValidDateStr(start) || !isValidDateStr(end)) return result;
  const d = new Date(start);
  const endD = new Date(end);
  if (isNaN(d.getTime()) || isNaN(endD.getTime()) || d > endD) return result;
  while (d <= endD) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

function YAxisTickFormatter(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function tooltipStyle(dark: boolean) {
  return {
    background: dark ? '#1c1c1e' : '#fff',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
    borderRadius: 6,
    fontSize: 12,
  };
}

/** Model Trend Chart: one line per model */
export function ModelTrendChart({ records, startDate, endDate }: TokenChartsProps) {
  const dark = isDarkTheme();
  const crossesYear = startDate.slice(0, 4) !== endDate.slice(0, 4);

  const { data, models } = useMemo(() => {
    const dates = fillDateRange(startDate, endDate);
    const byModel: Record<string, Record<string, number>> = {};
    const modelSet = new Set<string>();

    records.forEach(r => {
      const key = `${r.provider_id}:${r.model}`;
      modelSet.add(key);
      if (!byModel[key]) byModel[key] = {};
      byModel[key][r.date] = (byModel[key][r.date] || 0) + r.prompt_tokens;
    });

    const chartData = dates.map(date => {
      const row: Record<string, string | number> = { date };
      modelSet.forEach(m => {
        row[m] = byModel[m]?.[date] || 0;
      });
      return row;
    });

    return { data: chartData, models: [...modelSet] };
  }, [records, startDate, endDate]);

  if (!data.length) return null;

  const COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2', '#eb2f96'];

  return (
    <div className={styles['tu-chart-card']}>
      <div className={styles['tu-chart-title']}>模型用量趋势</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} />
          <XAxis
            dataKey="date"
            tickFormatter={d => formatDateLabel(d, crossesYear)}
            tick={{ fill: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={YAxisTickFormatter}
            tick={{ fill: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [formatCompact(Number(value)), String(name)]}
            contentStyle={tooltipStyle(dark)}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
          {models.map((m, i) => (
            <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Token Type Trend Chart: Prompt / Completion / Total per day */
export function TokenTypeChart({ records, startDate, endDate }: TokenChartsProps) {
  const dark = isDarkTheme();
  const crossesYear = startDate.slice(0, 4) !== endDate.slice(0, 4);

  const chartData = useMemo(() => {
    const dates = fillDateRange(startDate, endDate);
    return dates.map(date => {
      const dayRecords = records.filter(r => r.date === date);
      const prompt = dayRecords.reduce((s, r) => s + r.prompt_tokens, 0);
      const completion = dayRecords.reduce((s, r) => s + r.completion_tokens, 0);
      return { date, prompt, completion, total: prompt + completion };
    });
  }, [records, startDate, endDate]);

  if (!chartData.length) return null;

  return (
    <div className={styles['tu-chart-card']}>
      <div className={styles['tu-chart-title']}>Token 类型趋势</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} />
          <XAxis
            dataKey="date"
            tickFormatter={d => formatDateLabel(d, crossesYear)}
            tick={{ fill: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={YAxisTickFormatter}
            tick={{ fill: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [formatCompact(Number(value)), String(name)]}
            contentStyle={tooltipStyle(dark)}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
          <Line type="monotone" dataKey="prompt" stroke="#1677ff" name="输入" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="completion" stroke="#52c41a" name="输出" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="total" stroke="#fa8c16" name="总量" dot={false} strokeWidth={2} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
