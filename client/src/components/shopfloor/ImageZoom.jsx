// A picture in a large dialog, to look at closely: zoom with the buttons, the mouse wheel, a double click or + / -, drag
// to move it, Esc or the close button to leave. Used for a model's artwork on WIP Capture.
import { useRef, useState } from 'react';
import { Maximize, Minus, Plus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';

const MIN = 1;
const MAX = 6;
const clamp = (z) => Math.min(MAX, Math.max(MIN, z));

export default function ImageZoom({ src, alt, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  function zoomTo(z) {
    const next = clamp(z);
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 }); // back to the whole picture
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[88dvh] w-[94vw] max-w-[94vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,1400px)]"
        onKeyDown={(e) => {
          if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.5);
          else if (e.key === '-') zoomTo(zoom / 1.5);
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{alt}</DialogTitle>
            <DialogDescription className="text-xs">Scroll or double-click to zoom · drag to move · Esc to close</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="outline" size="icon" onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= MIN} aria-label="Zoom out">
              <Minus />
            </Button>
            <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button type="button" variant="outline" size="icon" onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= MAX} aria-label="Zoom in">
              <Plus />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => zoomTo(1)} aria-label="Whole picture">
              <Maximize />
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </DialogClose>
          </div>
        </div>
        <div
          className={`relative flex-1 overflow-hidden bg-muted/40 ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
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
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain p-4"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: drag.current ? 'none' : 'transform 120ms ease-out' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
