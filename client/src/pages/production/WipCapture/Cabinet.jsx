// The scanned unit's cabinet: what the operator matches the unit against, with the image the routing shows at this stage.
import { useState } from 'react';
import { Refrigerator, ZoomIn } from 'lucide-react';
import ImageZoom from '@/components/shopfloor/ImageZoom.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { wipApi } from './wipApi.js';

export default function Cabinet({ unit, serial, model, className }) {
  const [zoomed, setZoomed] = useState(false); // the artwork full screen
  const c = unit?.cabinet;
  // only what the operator matches the unit against (owner, 1 Nov 2026): the FG material's model and category, its
  // graphics and customer variant fields; before the cabinet answers, the model the scan gave
  const a0 = c?.artwork ?? {};
  const rows = c
    ? [
        ['Model', a0.name || c.name || model],
        ['Category', a0.category || c.category],
        ['Graphics', a0.graphics],
        ['Customer', a0.customer || c.customer],
      ]
    : model
      ? [['Model', model]]
      : [];
  // The image the routing shows at this station's stage (Routing screen, "Images on WIP Capture": artwork, unit frame or
  // basket; owner, 1 Nov 2026), large, with only what the operator matches it against. Graphics and customer are the
  // model's own variant fields. A stage set to show no image: the details below, no picture.
  if (c?.artwork?.kind) {
    // the FG material's (the artwork is uploaded there, not on the in-process material)
    const a = c.artwork ?? {};
    const artworkUrl = wipApi.imageUrl(serial ?? '', a.kind);
    const kindName = { artwork: 'artwork', unitframe: 'unit frame image', basket: 'basket image' }[a.kind] ?? 'image';
    const facts = [
      ['Model', a.name || model],
      ['Category', a.category],
      ['Graphics', a.graphics],
      ['Customer', a.customer],
    ];
    return (
      <SectionCard icon={Refrigerator} title="Cabinet" className={className}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch">
          {/* the FG material's Artwork ("Artwork & Packing Images" on the Material screen): an image (click to zoom),
              or a PDF (opens in its own viewer, which zooms) */}
          {a.hasArtwork && serial ? (
            a.artworkType === 'application/pdf' ? (
              <div className="w-full sm:w-3/5">
                <object data={`${artworkUrl}#toolbar=0&view=FitH`} type="application/pdf" aria-label={`Artwork of ${a.name}`} className="h-80 w-full rounded-lg border bg-muted/30">
                  <a className="text-sm underline" href={artworkUrl} target="_blank" rel="noreferrer">Open the artwork</a>
                </object>
                <a className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" href={artworkUrl} target="_blank" rel="noreferrer">
                  <ZoomIn className="size-4" aria-hidden="true" /> Open full size
                </a>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="group relative w-full cursor-zoom-in overflow-hidden rounded-lg border bg-muted/30 p-2 sm:w-3/5"
                aria-label={`Artwork of ${a.name}: open full screen`}
              >
                <img src={artworkUrl} alt={`Artwork of ${a.name}`} className="mx-auto max-h-96 w-full object-contain" />
                <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white opacity-90 group-hover:opacity-100">
                  <ZoomIn className="size-4" aria-hidden="true" /> Click to zoom
                </span>
              </button>
            )
          ) : (
            <div className="grid h-56 w-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground sm:w-3/5">
              No {kindName} for this model
            </div>
          )}
          {/* the details spread over the card's height, large enough to read from the line */}
          <dl className="flex min-w-0 flex-1 flex-col justify-around gap-5 py-1">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{k}</dt>
                <dd className="mt-1 text-xl leading-snug font-bold break-words">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        {zoomed && <ImageZoom src={artworkUrl} alt={`Artwork of ${a.name}`} onClose={() => setZoomed(false)} />}
      </SectionCard>
    );
  }
  return (
    <SectionCard icon={Refrigerator} title="Cabinet" className={className}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Scan a serial to see the cabinet.</p>
      ) : (
        <div className="flex h-full gap-5">
          {/* no picture here: a stage shows an image only when its routing says so (above) */}
          <dl className="grid min-w-0 flex-1 content-center gap-x-8 gap-y-8 py-2 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{k}</dt>
                <dd className="mt-1 text-xl leading-snug font-bold break-words">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}
