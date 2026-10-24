import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';

const WIDTH = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl', xl: 'sm:max-w-7xl' };

/**
 * A dialog (shadcn Dialog): title, scrolling body, footer actions. Esc and the close button call onClose.
 * Pass the actions as `footer`, usually a <ModalFooter>. Render it only while it is open.
 */
export default function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${WIDTH[size] ?? WIDTH.md} gap-0 p-0`} aria-describedby={subtitle ? undefined : undefined}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={subtitle ? '' : 'sr-only'}>{subtitle || title}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto p-6">{children}</div>
        {footer && <DialogFooter className="border-t px-6 py-4">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

const LEGACY = { primary: 'default', danger: 'destructive' };

export function ModalFooter({ onCancel, onSave, saveLabel = 'Save', saving, saveVariant = 'default', cancelLabel = 'Cancel' }) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={LEGACY[saveVariant] ?? saveVariant} onClick={onSave} loading={saving}>{saveLabel}</Button>
    </>
  );
}

/** Confirmation for actions that change state in a way users should think about. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, variant = 'destructive', onConfirm, onCancel, busy }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm" footer={<ModalFooter onCancel={onCancel} onSave={onConfirm} saveLabel={confirmLabel} saving={busy} saveVariant={variant} cancelLabel={cancelLabel} />}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </Modal>
  );
}
