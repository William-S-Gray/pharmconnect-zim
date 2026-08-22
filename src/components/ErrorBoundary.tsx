import React from 'react';
import { AlertTriangle, RefreshCw, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  /** Optional fallback pharmacy phone in case the backend is unreachable */
  fallbackPhone?: string;
  /** Section label shown in error message e.g. "search results" */
  section?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  isBackendDown: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', isBackendDown: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message || '';
    const isBackendDown =
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('Cannot reach the server') ||
      msg.includes('Failed to load');

    return {
      hasError: true,
      errorMessage: msg,
      isBackendDown,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', isBackendDown: false });
  };

  render() {
    const { hasError, isBackendDown } = this.state;
    const { section = 'this section', fallbackPhone } = this.props;

    if (!hasError) return this.props.children;

    return (
      <div
        className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-border"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted)/0.4) 100%)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'hsl(38 92% 50% / 0.15)', border: '1.5px solid hsl(38 80% 65%)' }}
        >
          <AlertTriangle className="w-7 h-7" style={{ color: 'hsl(38 80% 48%)' }} />
        </div>

        <h2 className="font-heading font-bold text-lg text-foreground mb-2">
          {isBackendDown
            ? 'Connection problem'
            : `Something went wrong in ${section}`}
        </h2>

        <p className="text-sm text-muted-foreground mb-5 max-w-sm leading-relaxed">
          {isBackendDown
            ? "We're having trouble reaching our servers right now. This is usually temporary — please try again in a moment."
            : 'An unexpected error occurred. Refreshing this section usually fixes it.'}
        </p>

        {fallbackPhone && (
          <p className="text-xs text-muted-foreground mb-4">
            You can also call a pharmacy directly:{' '}
            <a href={`tel:${fallbackPhone}`} className="text-primary font-medium hover:underline">
              <Phone className="w-3 h-3 inline mr-0.5" />
              {fallbackPhone}
            </a>
          </p>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-1.5"
          >
            Reload Page
          </Button>
        </div>
      </div>
    );
  }
}
