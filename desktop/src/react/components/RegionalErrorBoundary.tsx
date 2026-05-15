import { Component, type ReactNode } from 'react';
import styles from './RegionalErrorBoundary.module.css';

declare function t(key: string, vars?: Record<string, string | number>): string;

interface Props {
  region: string;
  resetKeys?: unknown[];
  children: ReactNode;
}

interface State {
  error: Error | null;
  prevResetKeys: unknown[];
}

export class RegionalErrorBoundary extends Component<Props, State> {
  state: State = { error: null, prevResetKeys: this.props.resetKeys || [] };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKeys && state.error) {
      const changed = props.resetKeys.some((k, i) => k !== state.prevResetKeys[i]);
      if (changed) return { error: null, prevResetKeys: props.resetKeys };
    }
    if (props.resetKeys) return { prevResetKeys: props.resetKeys };
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Import dynamically to avoid circular deps and TS issues with JS imports
    // @ts-expect-error -- shared JS module, no type declarations
    import('../../../../shared/error-bus.js').then(({ errorBus }: { errorBus: { report: (e: unknown, opts?: unknown) => void } }) => {
      // @ts-expect-error -- shared JS module, no type declarations
      import('../../../../shared/errors.js').then(({ AppError }: { AppError: new (code: string, opts?: Record<string, unknown>) => Error }) => {
        errorBus.report(new AppError('RENDER_CRASH', {
          cause: error,
          context: { region: this.props.region, componentStack: info.componentStack?.slice(0, 500) },
        }));
      });
    }).catch(() => { /* best effort - error reporting itself failed */ });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className={styles.fallback}>
          <svg className={styles.errorIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className={styles.message}>{t('error.regionUnavailable')}</p>
          <button className={styles.retry} onClick={this.handleRetry}>
            {t('action.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
