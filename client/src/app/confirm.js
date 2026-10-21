/**
 * Yes / no questions in the app's own dialog instead of the browser's confirm box:
 *   if (!(await askConfirm({ title: 'Delete section?', message: '…', confirmLabel: 'Delete' }))) return;
 * The dialog is drawn by <ConfirmHost /> (mounted once in the layout). variant: 'danger' (default),
 * 'primary' or 'success'. Resolves true for the confirm button, false for Cancel, Esc or a click outside.
 */
let listener = null;

export function askConfirm({ title = 'Are you sure?', message = '', confirmLabel = 'OK', cancelLabel, variant = 'danger' } = {}) {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ title, message, confirmLabel, cancelLabel, variant, resolve });
  });
}

/** Used by ConfirmHost only. */
export function setConfirmListener(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
