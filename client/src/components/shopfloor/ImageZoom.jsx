// A picture full screen, to look at closely: zoom with the buttons, the mouse wheel or a double click, drag to move it,
// Esc or the close button to leave. Used for a model's artwork on WIP Capture.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize, Minus, Plus, X } from 'lucide-react';

const MIN = 1;
const MAX = 6;
const clamp = (z) => Math.min(MAX, Math.max(MIN, z));

export default function ImageZoom({ src, alt, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.5);
      else if (e.key === '-') zoomTo(zoom / 1.5);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  function zoomTo(z) {
    const next = clamp(z);
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 }); // back to the whole picture
  }

  const button = 'grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] flex flex-col bg-neutral-950">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm">{alt}</p>
        <div className="flex items-center gap-2">
          <button type="button" className={button} onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= MIN} aria-label="Zoom out">
            <Minus className="size-5" />
          </button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" className={button} onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Zoom in">
            <Plus className="size-5" />
          </button>
          <button type="button" className={button} onClick={() => zoomTo(1)} aria-label="Whole picture">
            <Maximize className="size-5" />
          </button>
          <button ref={closeRef} type="button" className={button} onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div
        className={`relative flex-1 overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))}
        onDoubleClick={() => zoomTo(zoom > 1 ? 1 : 2.5)}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onPointerMove={(e) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        // a click on the dark space around the picture (not a drag) closes it
        onClick={(e) => e.target === e.currentTarget && zoom === 1 && onClose()}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain p-4"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: drag.current ? 'none' : 'transform 120ms ease-out' }}
        />
      </div>
      <p className="pb-3 text-center text-xs text-white/60">Scroll or double-click to zoom · drag to move · Esc to close</p>
    </div>,
    document.body,
  );
}
