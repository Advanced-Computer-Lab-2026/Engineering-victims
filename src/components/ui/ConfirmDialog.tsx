import React, { useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import CustomButton from './CustomButton';

type Tone = 'warning' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Passed straight through to the confirm button, so the dialog shows the
   *  spinner while the action it confirmed is still running. */
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONES: Record<Tone, { chip: string; icon: React.ReactNode; button: 'danger' | 'primary' }> = {
  warning: {
    chip: 'bg-amber-950/60 border-amber-800/60 text-amber-400',
    icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
    button: 'primary',
  },
  danger: {
    chip: 'bg-rose-950/60 border-rose-800/60 text-rose-400',
    icon: <Trash2 className="h-5 w-5" aria-hidden />,
    button: 'danger',
  },
};

/**
 * In-app replacement for `window.confirm`: same yes/no contract, but styled to
 * the product instead of the browser's own dialog.
 *
 * The dialog only mounts while `open`, so Escape handling and the initial focus
 * land fresh on every opening. Backing out is blocked while `isLoading` — the
 * request is already on its way.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const styles = TONES[tone];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isLoading, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isLoading ? undefined : onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.chip}`}>
            {styles.icon}
          </span>
          <div className="min-w-0 space-y-2">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-white">
              {title}
            </h2>
            <p id="confirm-dialog-message" className="text-sm leading-relaxed text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <CustomButton variant="secondary" disabled={isLoading} onClick={onCancel} autoFocus>
            {cancelLabel}
          </CustomButton>
          <CustomButton variant={styles.button} isLoading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
