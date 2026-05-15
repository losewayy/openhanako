import React, { useState } from 'react';
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

interface TokenTablesProps {
  records: RawRecord[];
}

type SortKey = 'model' | 'prompt' | 'completion' | 'total' | 'calls' | 'date';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={styles['tu-sort-icon']} data-active={active ? '1' : undefined}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        {dir === 'asc' || !active
          ? <path d="M5 2L8 7H2L5 2Z" />
          : <path d="M5 8L2 3H8L5 8Z" />}
      </svg>
    </span>
  );
}

interface Col<T> { key: keyof T; label: string; render: (v: T[keyof T]) => string; sortable: boolean; }

function SortableTable<T extends Record<string, unknown>>({
  data, columns, sortKey, sortDir, onSort, emptyMsg,
}: {
  data: T[];
  columns: Col<T>[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: string) => void;
  emptyMsg: string;
}) {
  if (data.length === 0) {
    return <div className={styles['tu-empty']}>{emptyMsg}</div>;
  }
  return (
    <table className={styles['tu-table']}>
      <thead>
        <tr>
          {columns.map(col => (
            <th
              key={String(col.key)}
              className={col.sortable ? styles['tu-th-sortable'] : styles['tu-th']}
              onClick={col.sortable ? () => onSort(String(col.key)) : undefined}
            >
              {col.label}
              {col.sortable && <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : 'asc'} />}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map(col => (
              <td key={String(col.key)} className={styles['tu-td']}>{col.render(row[col.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TokenTables({ records }: TokenTablesProps) {
  const [modelSort, setModelSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total', dir: 'desc' });
  const [dateSort, setDateSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });

  // Aggregate by model
  const byModel: Record<string, { model: string; prompt: number; completion: number; total: number; calls: number }> = {};
  records.forEach(r => {
    const key = `${r.provider_id}:${r.model}`;
    if (!byModel[key]) byModel[key] = { model: key, prompt: 0, completion: 0, total: 0, calls: 0 };
    byModel[key].prompt += r.prompt_tokens;
    byModel[key].completion += r.completion_tokens;
    byModel[key].total += r.prompt_tokens + r.completion_tokens;
    byModel[key].calls += r.call_count;
  });

  // Aggregate by date
  const byDate: Record<string, { date: string; prompt: number; completion: number; total: number; calls: number }> = {};
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, prompt: 0, completion: 0, total: 0, calls: 0 };
    byDate[r.date].prompt += r.prompt_tokens;
    byDate[r.date].completion += r.completion_tokens;
    byDate[r.date].total += r.prompt_tokens + r.completion_tokens;
    byDate[r.date].calls += r.call_count;
  });

  const handleModelSort = (key: string) => {
    setModelSort(prev => ({
      key: key as SortKey,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleDateSort = (key: string) => {
    setDateSort(prev => ({
      key: key as SortKey,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const modelData = [...Object.values(byModel)].sort((a, b) => {
    const aVal = a[modelSort.key as keyof typeof a];
    const bVal = b[modelSort.key as keyof typeof b];
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
    return modelSort.dir === 'desc' ? -cmp : cmp;
  });

  const dateData = [...Object.values(byDate)].sort((a, b) => {
    const aVal = a[dateSort.key as keyof typeof a];
    const bVal = b[dateSort.key as keyof typeof b];
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
    return dateSort.dir === 'desc' ? -cmp : cmp;
  });

  const modelCols: Col<typeof modelData[0]>[] = [
    { key: 'model', label: '模型', render: v => v as string, sortable: true },
    { key: 'prompt', label: '输入', render: v => formatCompact(v as number), sortable: true },
    { key: 'completion', label: '输出', render: v => formatCompact(v as number), sortable: true },
    { key: 'total', label: '总量', render: v => formatCompact(v as number), sortable: true },
    { key: 'calls', label: '调用', render: v => formatCompact(v as number), sortable: true },
  ];

  const dateCols: Col<typeof dateData[0]>[] = [
    { key: 'date', label: '日期', render: v => v as string, sortable: true },
    { key: 'prompt', label: '输入', render: v => formatCompact(v as number), sortable: true },
    { key: 'completion', label: '输出', render: v => formatCompact(v as number), sortable: true },
    { key: 'total', label: '总量', render: v => formatCompact(v as number), sortable: true },
    { key: 'calls', label: '调用', render: v => formatCompact(v as number), sortable: true },
  ];

  return (
    <div className={styles['tu-tables']}>
      <div className={styles['tu-table-card']}>
        <div className={styles['tu-table-title']}>按模型</div>
        <SortableTable data={modelData} columns={modelCols} sortKey={modelSort.key} sortDir={modelSort.dir} onSort={handleModelSort} emptyMsg="暂无数据" />
      </div>
      <div className={styles['tu-table-card']}>
        <div className={styles['tu-table-title']}>按日期</div>
        <SortableTable data={dateData} columns={dateCols} sortKey={dateSort.key} sortDir={dateSort.dir} onSort={handleDateSort} emptyMsg="暂无数据" />
      </div>
    </div>
  );
}
