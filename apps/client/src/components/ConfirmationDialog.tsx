import { AlertTriangle, X } from 'lucide-react';

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return <div className="dialog-backdrop confirmation-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
    <section className="dialog confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
      <div className="dialog-head"><div className="confirmation-heading"><span><AlertTriangle size={18} /></span><div><h2 id="confirmation-title">{title}</h2><p id="confirmation-message">{message}</p></div></div><button type="button" className="icon-button" aria-label="Close confirmation" disabled={busy} onClick={onCancel}><X size={18} /></button></div>
      <div className="dialog-actions confirmation-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="button danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : confirmLabel}</button></div>
    </section>
  </div>;
}
