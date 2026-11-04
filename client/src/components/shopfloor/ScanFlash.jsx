// A refused scan, large in the middle of the screen (owner, 1 Nov 2026), without stopping the scanning: it takes no
// focus and no clicks (the scanner keeps typing into its box), goes by itself after a few seconds, and a new one
// replaces it at once. Put <ScanFlashHost /> on the page once; call flashError(title, text) from anywhere.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';

const SHOW_MS = 4000;
let show = () => {};

/** shows a refused scan in the middle of the screen */
export function flashError(title, text) {
  show({ title, text, at: Date.now() });
}

export default function ScanFlashHost() {
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    show = setFlash;
    return () => {
      show = () => {};
    };
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [flash]);

  if (!flash) return null;
  return createPortal(
    // pointer-events-none and nothing focusable: scans and clicks go on as if it were not there
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-6">
      <div
        key={flash.at}
        role="alert"
        aria-live="assertive"
        className="flex max-w-2xl animate-in items-start gap-4 rounded-2xl bg-rose-600 px-8 py-6 text-white shadow-2xl ring-4 ring-rose-300/60 fade-in-0 zoom-in-95 duration-150 dark:ring-rose-900/60"
      >
        <XCircle className="mt-0.5 size-10 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-bold">{flash.title}</p>
          {flash.text && <p className="mt-1.5 text-lg leading-snug text-white/90">{flash.text}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
