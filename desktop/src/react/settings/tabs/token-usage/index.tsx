import React, { useEffect, useState, useCallback } from 'react';
import { hanaFetch } from '../../api';
import { SummaryCards } from './components/SummaryCards';
import { ModelTrendChart, TokenTypeChart } from './components/TokenCharts';
import { TokenTables } from './components/TokenTables';
import styles from '../../Settings.module.css';

interface TokenUsageRecord {
  date: string;
  provider_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function subtractDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

const POLL_INTERVAL = 30_000; // 30s auto-refresh

export function TokenUsageTab() {
  const [records, setRecords] = useState<TokenUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [startDate, setStartDate] = useState(() => toDateStr(subtractDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(() => toDateStr(new Date()));

  const fetchData = useCallback(async ({
    setLoading: shouldSetLoading = true
  } = {}) => {
    if (shouldSetLoading) setLoading(true);
    setError(false);
    try {
      const res = await hanaFetch(`/api/token-usage?start_date=${startDate}&end_date=${endDate}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch {
      setError(true);
      setRecords([]);
    } finally {
      if (shouldSetLoading) setLoading(false);
    }
  }, [startDate, endDate]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 轮询：仅前台可见时每 30s 自动刷新，不显示 loading
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') {
        fetchData({ setLoading: false });
      }
    };
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const totals = {
    totalCalls: records.reduce((s, r) => s + r.call_count, 0),
    totalPrompt: records.reduce((s, r) => s + r.prompt_tokens, 0),
    totalCompletion: records.reduce((s, r) => s + r.completion_tokens, 0),
    total: records.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0),
  };

  return (
    <div className={`${styles['settings-tab-content']} ${styles['active']}`} data-tab="token-usage">
      {/* 日期选择器 */}
      <div className={styles['tu-toolbar']}>
        <span className={styles['tu-toolbar-label']}>日期范围</span>
        <input
          type="date"
          className={styles['tu-date-input']}
          value={startDate}
          max={endDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <span className={styles['tu-date-sep']}>—</span>
        <input
          type="date"
          className={styles['tu-date-input']}
          value={endDate}
          min={startDate}
          max={toDateStr(new Date())}
          onChange={e => setEndDate(e.target.value)}
        />
        <button className={styles['tu-refresh-btn']} onClick={() => fetchData()} disabled={loading}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className={styles['tu-loading']}>加载中…</div>
      )}

      {error && (
        <div className={styles['tu-error']}>
          <span>加载失败</span>
          <button className={styles['tu-retry-btn']} onClick={() => fetchData()}>重试</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <SummaryCards
            totalCalls={totals.totalCalls}
            totalPromptTokens={totals.totalPrompt}
            totalCompletionTokens={totals.totalCompletion}
            totalTokens={totals.total}
          />

          <div className={styles['tu-charts-row']}>
            <ModelTrendChart records={records} startDate={startDate} endDate={endDate} />
            <TokenTypeChart records={records} startDate={startDate} endDate={endDate} />
          </div>

          {records.length === 0 ? (
            <div className={styles['tu-empty-main']}>暂无用量数据</div>
          ) : (
            <TokenTables records={records} />
          )}
        </>
      )}
    </div>
  );
}
