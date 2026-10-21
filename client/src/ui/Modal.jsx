import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button.jsx';

/**
 * Dialog in WRL Master Config style: header, scrolling body, footer actions.
 * Escape and the close button call onClose; focus moves into the dialog when it opens.
 * Pass the actions as `footer`, usually a <ModalFooter>.
 */
export default function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    // Esc closes only the dialog on top (a confirmation can open over another dialog).
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (open[open.length - 1] === ref.current) onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-7xl' }[size];
  // Rendered at the end of <body>, so sticky or blurred parents cannot clip it.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`animate-fadeIn bg-white rounded-xl shadow-lift ring-1 ring-slate-900/10 w-full ${width} max-h-[92vh] overflow-hidden flex flex-col`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button data-close type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ModalFooter({ onCancel, onSave, saveLabel = 'Save', saving, saveVariant = 'primary', cancelLabel = 'Cancel' }) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={saveVariant} onClick={onSave} loading={saving}>{saveLabel}</Button>
    </>
  );
}

/** Confirmation for actions that change state in a way users should think about. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, variant = 'danger', onConfirm, onCancel, busy }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm" footer={<ModalFooter onCancel={onCancel} onSave={onConfirm} saveLabel={confirmLabel} saving={busy} saveVariant={variant} cancelLabel={cancelLabel} />}>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
