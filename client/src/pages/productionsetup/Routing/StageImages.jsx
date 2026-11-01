// Routing: "Images on WIP Capture" (owner, 1 Nov 2026): for each stage of a saved routing, which of the material's
// images (Material screen, "Artwork & Packing Images") WIP Capture shows at that stage's stations: one, or none.
// /api/masters/routings/:route/stage-images (server/src/modules/masters/routing-stage-images.js).
import { useEffect, useState } from 'react';
import { Image as ImageIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';

const KINDS = [
  ['', 'None'],
  ['artwork', 'Artwork'],
  ['unitframe', 'Unit frame'],
  ['basket', 'Basket'],
];

export default function StageImages({ routeCode }) {
  const url = `/masters/routings/${encodeURIComponent(routeCode)}/stage-images`;
  const [stages, setStages] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false); // the table is not on this database yet
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api(url)
      .then((r) => {
        if (!live) return;
        setStages(r.stages);
        setSaved(JSON.stringify(r.stages));
        setSetupNeeded(!!r.setupNeeded);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [url]);

  const dirty = stages && JSON.stringify(stages) !== saved;
  const pick = (processCode, imageKind) => setStages((s) => s.map((x) => (x.processCode === processCode ? { ...x, imageKind: imageKind || null } : x)));

  async function save() {
    setBusy(true);
    try {
      const r = await api(url, { method: 'PUT', body: { stages: stages.map(({ processCode, imageKind }) => ({ processCode, imageKind })) } });
      setStages(r.stages);
      setSaved(JSON.stringify(r.stages));
      toast.success('Images on WIP Capture saved');
    } catch (e) {
      toast.error(e.message, { id: e.message, duration: 6000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      icon={ImageIcon}
      title="Images on WIP Capture"
      actions={
        stages?.length > 0 && (
          <Button icon={Save} loading={busy} disabled={!dirty || busy || setupNeeded} onClick={save}>
            Save images
          </Button>
        )
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        For each stage, the material image WIP Capture shows at its stations (uploaded on the Material screen, Artwork &amp; Packing Images). None: no picture at that stage.
      </p>
      {setupNeeded && (
        <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Not set up on this database yet: run <code className="font-mono">server/db/migrations/2026-11-routing-stage-images.sql</code> on it once (SQL Server Management Studio), then reload this page.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !stages ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">This routing has no stages yet. Add them above and save the routing first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Step</th>
                <th className="px-4 py-2.5 font-medium">Process</th>
                <th className="px-4 py-2.5 font-medium">Image on WIP Capture</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stages.map((s) => (
                <tr key={s.processCode}>
                  <td className="px-4 py-2 tabular text-muted-foreground">{s.seq}</td>
                  <td className="px-4 py-2 font-medium">{s.process}</td>
                  <td className="px-4 py-2">
                    <div className="w-48">
                      <NativeSelect className="h-9" aria-label={`Image on WIP Capture for ${s.process}`} value={s.imageKind ?? ''} onChange={(e) => pick(s.processCode, e.target.value)}>
                        {KINDS.map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
