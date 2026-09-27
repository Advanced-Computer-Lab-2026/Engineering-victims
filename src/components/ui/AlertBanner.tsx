import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'error' | 'success' | 'info';

interface AlertBannerProps {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  /** Dismissible alerts report a transient outcome, so they get a close control. */
  onDismiss?: () => void;
}

const TONES: Record<Tone, { wrap: string; icon: React.ReactNode }> = {
  error: {
    wrap: 'bg-rose-950/40 border-rose-800/60 text-rose-200',
    icon: <AlertCircle className="h-4 w-4 text-rose-400" aria-hidden />,
  },
  success: {
    wrap: 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />,
  },
  info: {
    wrap: 'bg-slate-900/70 border-slate-700 text-slate-300',
    icon: <Info className="h-4 w-4 text-slate-400" aria-hidden />,
  },
};

const AlertBanner: React.FC<AlertBannerProps> = ({ tone = 'info', title, children, onDismiss }) => {
  const styles = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles.wrap}`}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-[13px] leading-relaxed break-words">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="shrink-0 rounded-md p-1 text-current opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
};

export default AlertBanner;
