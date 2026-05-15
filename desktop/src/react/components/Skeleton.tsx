import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
    variant?: 'text' | 'circle' | 'rect';
    width?: string | number;
    height?: string | number;
    className?: string;
}

export function Skeleton({ variant = 'rect', width, height, className }: SkeletonProps) {
    return (
        <div
            className={`${styles.skeleton} ${styles[variant]} ${className || ''}`}
            style={{ width, height }}
        />
    );
}