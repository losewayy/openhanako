import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={`${styles.emptyState} ${className || ''}`}>
            {icon && <div className={styles.emptyStateIcon}>{icon}</div>}
            <h3 className={styles.emptyStateTitle}>{title}</h3>
            {description && <p className={styles.emptyStateDesc}>{description}</p>}
            {action && (
                <button className={styles.emptyStateAction} onClick={action.onClick}>
                    {action.label}
                </button>
            )}
        </div>
    );
}