// Material: its artwork, unit frame and basket images (server: modules/masters/material-images.js). New with this
// app (owner, 28 Oct 2026). Each one is stored as soon as it is picked, on a saved material, apart from Save / Update.
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, ImageOff, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import { Button } from '@/components/ui/button.jsx';

const KINDS = [
  { kind: 'artwork', title: 'Artwork' },
  { kind: 'unitframe', title: 'Unit frame' },
  { kind: 'basket', title: 'Basket' },
];
const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024; // as the server allows

const base64Of = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });

/** one kind: its preview, file name and date, and Upload / Replace, Open, Remove */
function ImageCard({ code, kind, title, info, busy, onUpload, onRemove, version }) {
  const input = useRef(null);
  const url = `/api/masters/materials/${code}/images/${kind}?v=${version}`;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="grid h-44 place-items-center border-b bg-muted/40">
        {!info ? (
          <ImageOff className="size-8 text-muted-foreground/50" aria-hidden="true" />
        ) : info.mimeType === 'application/pdf' ? (
          <FileText className="size-10 text-rose-600" aria-hidden="true" />
        ) : (
          <img src={url} alt={`${title} of the material`} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="truncate text-xs text-muted-foreground" title={info?.fileName}>
            {info ? `${info.fileName} · ${new Date(info.updatedOn).toLocaleString()}` : 'No image yet'}
          </p>
        </div>
        <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-label={`${title} file`} onChange={(e) => (e.target.files?.[0] && onUpload(e.target.files[0]), (e.target.value = ''))} />
        <div className="mt-auto flex flex-wrap gap-2">
          <Button type="button" size="sm" icon={Upload} loading={busy} onClick={() => input.current?.click()}>{info ? 'Replace' : 'Upload'}</Button>
          {info && (
            <>
              <Button type="button" size="sm" variant="outline" icon={ExternalLink} onClick={() => window.open(url, '_blank', 'noopener')}>Open</Button>
              <Button type="button" size="icon-sm" variant="outline" icon={Trash2} className="text-rose-600" title={`Remove the ${title.toLowerCase()}`} aria-label={`Remove the ${title.toLowerCase()}`} disabled={busy} onClick={onRemove} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** code: the material's code; saved: false on Add new (nothing to attach the images to yet) */
export default function MaterialImages({ code, saved }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(null); // the kind being uploaded / removed
  const [version, setVersion] = useState(0); // a new image's URL, past the browser's copy of the old one
  const ok = saved && /^\d+$/.test(String(code ?? '')) && Number(code) > 0;
  const load = () => api(`/masters/materials/${code}/images`).then(setList).catch((e) => toast.error(e.message));
  useEffect(() => {
    if (ok) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, ok]);

  if (!ok) return <p className="text-sm text-muted-foreground">Save the material first; then its artwork, unit frame and basket images can be added here.</p>;

  async function upload(kind, title, file) {
    if (file.size > MAX_BYTES) return void toast.error('The file is larger than 10 MB.');
    setBusy(kind);
    try {
      await api(`/masters/materials/${code}/images/${kind}`, { method: 'PUT', body: { fileName: file.name, data: await base64Of(file) } });
      toast.success(`${title} saved`);
      setVersion((v) => v + 1);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind, title) {
    if (!(await askConfirm({ title: `Remove the ${title.toLowerCase()}?`, message: 'The image is deleted from this material at once.', confirmLabel: 'Remove' }))) return;
    setBusy(kind);
    try {
      await api(`/masters/materials/${code}/images/${kind}`, { method: 'DELETE' });
      toast.success(`${title} removed`);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {KINDS.map(({ kind, title }) => (
        <ImageCard key={kind} code={code} kind={kind} title={title} info={list.find((r) => r.kind === kind)} busy={busy === kind} version={version} onUpload={(f) => upload(kind, title, f)} onRemove={() => remove(kind, title)} />
      ))}
    </div>
  );
}
