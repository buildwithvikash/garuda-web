import { useEffect, useState } from 'react';
import { setConfirmListener } from '@/app/confirm.js';
import { ConfirmDialog } from '@/components/shared/Modal.jsx';

/** Draws the questions asked with askConfirm() (app/confirm.js), one at a time. Mounted once in the layout. */
export default function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  useEffect(() => setConfirmListener((q) => setAsk((cur) => {
    cur?.resolve(false); // a new question replaces one still open
    return q;
  })), []);
  if (!ask) return null;
  const answer = (yes) => {
    ask.resolve(yes);
    setAsk(null);
  };
  return (
    <ConfirmDialog
      title={ask.title}
      message={ask.message}
      confirmLabel={ask.confirmLabel}
      cancelLabel={ask.cancelLabel}
      variant={ask.variant}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}
