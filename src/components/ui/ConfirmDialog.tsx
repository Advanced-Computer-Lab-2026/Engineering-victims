import React, { useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import CustomButton from './CustomButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
  /** Keeps the confirm button disabled, e.g. until a required field is valid. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONES: Record<Tone, { chip: string; icon: React.ReactNode; button: 'danger' | 'primary' }> = {
  warning: {
    chip: 'bg-warning-container border-warning text-warning',
    icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
    button: 'primary',
  },
  danger: {
    chip: 'bg-error-container border-error text-error',
    icon: <Trash2 className="h-5 w-5" aria-hidden />,
    button: 'danger',
  },
};

/**
 * In-app replacement for `window.confirm`: same yes/no contract, but styled to
 * the product instead of the browser's own dialog.
 *
 * The dialog only mounts while `open`, so Escape handling, focus trapping and
 * the initial focus land fresh on every opening. Backing out is blocked while
 * `isLoading` — the request is already on its way.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) => {
  const styles = TONES[tone];
  const trapRef = useFocusTrap<HTMLDivElement>(open);

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
    <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
      <div
        className="absolute inset-0 scrim backdrop-blur-sm"
        onClick={isLoading ? undefined : onCancel}
        aria-hidden
      />
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-3"
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.chip}`}>
            {styles.icon}
          </span>
          <div className="min-w-0 space-y-2">
            <h2 id="confirm-dialog-title" className="text-body-lg font-bold text-on-surface">
              {title}
            </h2>
            <p id="confirm-dialog-message" className="text-body leading-relaxed text-on-surface-variant">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <CustomButton variant="secondary" disabled={isLoading} onClick={onCancel} autoFocus>
            {cancelLabel}
          </CustomButton>
          <CustomButton variant={styles.button} isLoading={isLoading} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
