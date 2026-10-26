// Production assignment: choose the order and where it starts (routing, stage, station), the quantity and a printer;
// Print makes one job card, stage label, barcode and printed label per piece. Each choice asks the server what it
// fills; Print is replayed and checked on the server.
import { Boxes, ClipboardList, Factory, Printer, Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FormError, Loader, SearchSelect, Section, Select, TextInput } from '@/components/shared';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { blankAssignment, changeAssignment, printAssignment } from './assignmentsApi.js';

const opts = (list) => (list ?? []).map((o) => ({ value: o.value, label: o.text }));

/** a read-only list of rows */
function Lines({ rows, cols }) {
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>{cols.map(([, h]) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>{cols.map(([k, h]) => <td key={h} className="px-4 py-2 tabular-nums">{r[k] || '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AssignmentForm() {
  const [screen, setScreen] = useState(null); // { assignment, options, ui, details, left }
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    blankAssignment().then((s) => (setScreen(s), s.message && setError(s.message)), (e) => setError(e.message));
  }, []);
  if (!screen) return error ? <FormError message={error} /> : <Loader />;
  const { assignment: a, options, ui, details, left } = screen;

  const set = (field) => (value) => {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setScreen((s) => ({ ...s, assignment: { ...s.assignment, [field]: value ?? '' } }));
  };
  async function choose(field, value) {
    const next = { ...a, [field]: value ?? '' };
    setScreen((s) => ({ ...s, assignment: next }));
    setBusy(true);
    setError('');
    try {
      const s = await changeAssignment(field, next);
      setScreen(s);
      if (s.message) setError(s.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const r = await printAssignment(a);
      toast.success(`${r.message || 'Assigned'}: ${a.qty} job card${a.qty === '1' ? '' : 's'} printed`);
      for (const x of r.alerts ?? []) toast(x);
      setScreen(r);
    } catch (e) {
      setError(e.message);
      setErrors(e.data?.errors ?? {});
    } finally {
      setBusy(false);
    }
  }
  const err = (f) => errors[f]?.replace(/^\w+ /, '');
  const leftAtStage = a.process && left !== '' ? left : null;

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <fieldset disabled={busy} className="space-y-4">
        <Section icon={ClipboardList} title="Order">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Department" options={opts(options.department)} value={a.department} onChange={(v) => choose('department', v)} />
            <SearchSelect label="Production order" className="sm:col-span-2" options={opts(options.order)} value={a.order} onChange={(v) => choose('order', v)} />
          </div>
        </Section>

        <Section icon={Boxes} title="Product">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SearchSelect label="Material" className="sm:col-span-2" options={opts(options.material)} value={a.material} onChange={set('material')} disabled={!ui.materialEditable || busy} />
            <Select label="Variant" options={opts(options.variant)} value={a.variant} onChange={set('variant')} />
            <SearchSelect label="BOM" className="sm:col-span-2" options={opts(options.bom)} value={a.bom} onChange={set('bom')} />
            <TextInput label="Order quantity" readOnly value={a.totalQty} className="tabular-nums" />
          </div>
        </Section>

        <Section icon={Factory} title="Start at">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Routing" options={opts(options.routing)} value={a.routing} onChange={(v) => choose('routing', v)} />
            <Select label="Stage" options={opts(options.process)} value={a.process} onChange={(v) => choose('process', v)} />
            <Select label="Station" options={opts(options.station)} value={a.station} onChange={(v) => choose('station', v)} />
          </div>
        </Section>

        <Section icon={Printer} title="Print job cards" actions={leftAtStage !== null && <Badge variant={Number(leftAtStage) > 0 ? 'secondary' : 'destructive'}>{leftAtStage} left to assign at this stage</Badge>}>
          <div className="flex flex-wrap items-end gap-4">
            <TextInput label="Quantity to start" inputMode="numeric" className="w-44 tabular-nums" disabled={!ui.qtyEditable || busy} value={a.qty} onChange={(e) => set('qty')(e.target.value)} error={err('qty')} />
            <Select label="Unit" className="w-40" options={opts(options.uom)} value={a.uom} onChange={set('uom')} />
            <Select label="Printer" className="w-64" options={opts(options.printer)} value={a.printer} onChange={set('printer')} />
            <Button type="button" size="lg" icon={Printer} loading={busy} onClick={print} className="ml-auto">Print job cards</Button>
          </div>
        </Section>
      </fieldset>

      {ui.details && (
        <>
          <Section icon={Route} title="Route (each stage's station)" flush>
            <Lines rows={details.route} cols={[['SeqNo', 'Seq'], ['Process', 'Stage'], ['Station', 'Station']]} />
          </Section>
          <Section icon={Boxes} title="Materials per piece" flush>
            <Lines rows={details.bomInput} cols={[['MaterialDesc', 'Material'], ['Qty', 'Qty'], ['UomDesc', 'Unit'], ['ProcessDesc', 'Stage']]} />
          </Section>
          {details.bomOutput.length > 0 && (
            <Section icon={Boxes} title="Output per piece" flush>
              <Lines rows={details.bomOutput} cols={[['MaterialDesc', 'Material'], ['Qty', 'Qty'], ['UomDesc', 'Unit'], ['ProcessDesc', 'Stage']]} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
