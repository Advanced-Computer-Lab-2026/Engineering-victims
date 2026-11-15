import React from 'react';
import { AlertCircle, CheckCircle2, Circle, Info, X } from 'lucide-react';

type Tone = 'error' | 'success' | 'info' | 'neutral';

interface AlertBannerProps {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  /** Dismissible alerts report a transient outcome, so they get a close control. */
  onDismiss?: () => void;
}

const TONES: Record<Tone, { wrap: string; icon: React.ReactNode }> = {
  error: {
    wrap: 'bg-error-container border-error text-on-error-container',
    icon: <AlertCircle className="h-4 w-4 text-error" aria-hidden />,
  },
  success: {
    wrap: 'bg-success-container border-success text-on-success-container',
    icon: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  },
  info: {
    wrap: 'bg-info-container border-info text-on-info-container',
    icon: <Info className="h-4 w-4 text-info" aria-hidden />,
  },
  neutral: {
    wrap: 'bg-surface-container border-outline-variant text-on-surface',
    icon: <Circle className="h-4 w-4 text-on-surface-variant" aria-hidden />,
  },
};

const AlertBanner: React.FC<AlertBannerProps> = ({ tone = 'info', title, children, onDismiss }) => {
  const styles = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-body ${styles.wrap}`}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-body leading-relaxed break-words">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
};

export default AlertBanner;
