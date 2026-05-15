import React from 'react';
import { formatCompact } from '../utils/formatNumber';
import styles from '../../../Settings.module.css';

interface SummaryCardsProps {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export function SummaryCards({ totalCalls, totalPromptTokens, totalCompletionTokens, totalTokens }: SummaryCardsProps) {
  return (
    <div className={styles['tu-summary-row']}>
      <div className={styles['tu-card']}>
        <div className={styles['tu-card-value']}>{formatCompact(totalCalls)}</div>
        <div className={styles['tu-card-label']}>总调用次数</div>
      </div>
      <div className={styles['tu-card']}>
        <div className={styles['tu-card-value']}>{formatCompact(totalPromptTokens)}</div>
        <div className={styles['tu-card-label']}>输入 Token</div>
      </div>
      <div className={styles['tu-card']}>
        <div className={styles['tu-card-value']}>{formatCompact(totalCompletionTokens)}</div>
        <div className={styles['tu-card-label']}>输出 Token</div>
      </div>
      <div className={styles['tu-card']}>
        <div className={styles['tu-card-value']}>{formatCompact(totalTokens)}</div>
        <div className={styles['tu-card-label']}>总消耗</div>
      </div>
    </div>
  );
}
