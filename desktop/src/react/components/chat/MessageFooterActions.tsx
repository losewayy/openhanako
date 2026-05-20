import { memo } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import styles from './Chat.module.css';
import { formatMessageTime, isValidTimestamp } from './timeline-anchors';

export { formatMessageTime, isValidTimestamp };

export interface MessageFooterAction {
  id: string;
  title: string;
  icon: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
}

interface Props {
  timeText?: string | null;
  actions: MessageFooterAction[];
  align?: 'left' | 'right';
  visible?: boolean;
  testId?: string;
}

export const MessageFooterActions = memo(function MessageFooterActions({
  timeText,
  actions,
  align = 'right',
  visible = false,
  testId,
}: Props) {
  if (!timeText && actions.length === 0) return null;

  return (
    <div
      className={[
        styles.messageFooterActions,
        align === 'left' ? styles.messageFooterActionsLeft : styles.messageFooterActionsRight,
        visible ? styles.messageFooterActionsVisible : '',
      ].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      {timeText && <span className={styles.messageFooterTime}>{timeText}</span>}
      {actions.map(action => (
        <button
          key={action.id}
          className={`${styles.messageFooterBtn}${action.active ? ` ${styles.messageFooterBtnActive}` : ''}`}
          onClick={action.onClick}
          title={action.title}
          disabled={action.disabled}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
});
