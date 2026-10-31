// Production Assignment: start a production order at its routing's first stage and print its job cards. Plain React:
// the fields are this screen's own; the state and server calls are in ./useAssignment.js.
import { Boxes, CheckCircle2, ClipboardList, Factory, PackageMinus, PackagePlus, Printer, Route, RotateCw } from 'lucide-react';
import DataTable from '@/components/shared/DataTable.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { LockedValue, Step } from '@/components/shared/FormStep.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils';
import { useAssignment } from './useAssignment.js';

const GRID_4 = 'grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4';
const GRID_2 = 'grid gap-x-5 gap-y-4 sm:grid-cols-2';

/** a cell as read: Yes / No for flags, — for nothing */
const cell = (v) => (v === true ? 'Yes' : v === false ? 'No' : v === '' || v == null ? '—' : String(v));
/** DataTable columns from [field, header] pairs */
const columns = (pairs) => pairs.map(([key, header]) => ({ key, header, exactHeader: true, text: (r) => cell(r[key]), render: (r) => cell(r[key]) }));

const ROUTE = columns([['seq', 'Step'], ['process', 'Process'], ['station', 'Station']]);
const BOM_INPUT = columns([['material', 'Material'], ['qty', 'Quantity'], ['unit', 'Unit'], ['process', 'Used at'], ['scanRequired', 'Scan needed'], ['outputScan', 'Output scanned']]);
const BOM_OUTPUT = columns([['material', 'Material'], ['qty', 'Quantity'], ['unit', 'Unit'], ['yieldQty', 'Yield'], ['process', 'Made at']]);

/** how much of an order is printed: started of total, as a bar; green once all of it is */
function OrderProgress({ started, total, unit = '' }) {
  const [s, t] = [Number(started) || 0, Number(total) || 0];
  if (t <= 0) return null;
  const all = s >= t;
  const u = unit ? ` ${unit}` : '';
  return (
    <div className="sm:col-span-2 lg:col-span-4">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Printed {s} of {t}
          {u}
        </span>
        {all ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden="true" /> All printed
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t - s}
            {u} left to print
          </span>
        )}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={t} aria-valuenow={Math.min(s, t)} aria-label="Printed so far">
        <div className={cn('h-full rounded-full transition-all', all ? 'bg-emerald-600' : 'bg-primary')} style={{ width: `${Math.min(100, (s / t) * 100)}%` }} />
      </div>
    </div>
  );
}

/** what the last print left its order at; it stays after the screen clears a fully printed order */
function LastPrint({ p }) {
  const [s, t] = [Number(p.started) || 0, Number(p.total) || 0];
  const all = t > 0 && s >= t;
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm lg:col-span-10', all ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200')}>
      {all ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <Printer className="size-4 shrink-0" aria-hidden="true" />}
      <span>
        Last print · <b>{p.orderName}</b>:{' '}
        {all ? <>all {t} printed. The order is complete and no longer in the list.</> : <>{s} of {t} printed, {t - s} left.</>}
      </span>
    </div>
  );
}

/** one of the order's lines (routing stages, BOM input / output), read-only */
const Lines = ({ id, rows, cols, empty }) => <DataTable tableId={id} columns={cols} rows={rows.map((r, i) => ({ id: i, ...r }))} empty={empty} exportName={id} />;

export default function AssignmentForm() {
  const { screen, loadError, errors, busy, lastPrint, setField, print } = useAssignment();

  const shell = (children, actions) => (
    <Page icon={Printer} title="Production Assignment" subtitle="Start a production order at its first station and print the job cards" actions={actions}>
      {children}
    </Page>
  );

  if (loadError)
    return shell(
      <div className="flex flex-col items-start gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button>
      </div>,
    );
  if (!screen) return shell(<Loader />);

  const { assignment: a, options, ui, details, left, started } = screen;
  // the server's lists ({ value, text }) as the Select takes them, and the name of a chosen value
  const opts = (field) => (options[field] ?? []).map((o) => ({ value: o.value, label: o.text }));
  const nameOf = (field) => (options[field] ?? []).find((o) => o.value === a[field])?.text ?? a[field];
  const unit = nameOf('totalUom') || nameOf('uom');
  const withUnit = (q) => (q === '' || q == null ? '' : `${q} ${unit ?? ''}`.trim());
  const select = (field, label, extra = {}) => (
    <Select label={label} value={a[field]} options={opts(field)} onChange={(v) => setField(field, v ?? '')} error={errors[field]} {...extra} />
  );

  const actions = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">{select('department', 'Department', { required: true })}</div>
      {/* a job card starts with the screen's default status */}
      <div className="w-44">
        <LockedValue label="Status" value={nameOf('status')} />
      </div>
    </div>
  );

  return shell(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        print();
      }}
      className="grid items-start gap-2 lg:grid-cols-10"
      noValidate
    >
      {lastPrint && <LastPrint p={lastPrint} />}

      <div className="min-w-0 lg:col-span-10">
        <Step n={1} tone="blue" icon={ClipboardList} title="Order" subtitle="The production order to start">
          <div className={GRID_4}>
            {select('order', 'Production order', { required: true, className: 'sm:col-span-2' })}
            <LockedValue label="Assignment date" value={a.assignDate} />
          </div>
        </Step>
      </div>

      <div className="min-w-0 lg:col-span-10">
        <Step n={2} tone="emerald" icon={Boxes} title="Product" subtitle="What the order makes, its routing and the quantity to start">
          <div className={GRID_4}>
            {/* the order's own material, unless its BOM has other routed components to start */}
            {ui.materialEditable ? select('material', 'Material') : <LockedValue label="Material" value={nameOf('material')} />}
            {select('variant', 'Variant')}
            <LockedValue label="BOM" value={nameOf('bom')} />
            {select('routing', 'Routing', { required: true })}
            <LockedValue label="Order quantity" value={withUnit(a.totalQty)} />
            {/* the order's job cards printed so far, at any process */}
            <LockedValue label="Already started" value={a.order ? withUnit(started) : ''} />
            <TextInput
              label="Quantity to start"
              required
              inputMode="numeric"
              value={a.qty ?? ''}
              onChange={(e) => setField('qty', e.target.value)}
              disabled={!ui.qtyEditable}
              error={errors.qty}
              hint={a.process && left !== '' && left != null ? `Left to start at this process: ${withUnit(left)}` : undefined}
            />
            <LockedValue label="Unit" value={nameOf('uom')} />
            {a.order && <OrderProgress started={started} total={a.totalQty} unit={unit} />}
          </div>
        </Step>
      </div>

      <div className="min-w-0 lg:col-span-5">
        <Step n={3} tone="violet" icon={Factory} title="Start at" subtitle="The process the job cards start at, and its station">
          <div className={GRID_2}>
            {select('process', 'Process', { required: true })}
            {select('station', 'Station', { required: true })}
          </div>
        </Step>
      </div>

      <div className="min-w-0 lg:col-span-5">
        <Step n={4} tone="amber" icon={Printer} title="Print job cards" subtitle="One job card, serial and label per piece">
          <div className="grid items-end gap-x-5 gap-y-4 sm:grid-cols-[1fr_auto]">
            {select('printer', 'Printer', { required: true })}
            <Button type="submit" icon={Printer} loading={busy === 'print'} disabled={busy !== null || !!errors.qty} className="h-10 px-5">
              Print job cards
            </Button>
          </div>
        </Step>
      </div>

      {/* the lines the job cards will carry, once a routing is chosen */}
      {ui.details && (
        <>
          <div className="min-w-0 lg:col-span-10">
            <Step n={5} tone="violet" icon={Route} title="Routing stages" subtitle="The stages the order goes through, in sequence">
              <Lines id="assignment-route" rows={details.route} cols={ROUTE} empty="Choose a station to see each stage's station." />
            </Step>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Step n={6} tone="amber" icon={PackageMinus} title="BOM input" subtitle="Materials the order consumes">
              <Lines id="assignment-bom-input" rows={details.bomInput} cols={BOM_INPUT} empty="No input lines." />
            </Step>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Step n={7} tone="emerald" icon={PackagePlus} title="BOM output" subtitle="What the order produces">
              <Lines id="assignment-bom-output" rows={details.bomOutput} cols={BOM_OUTPUT} empty="No output lines." />
            </Step>
          </div>
        </>
      )}
    </form>,
    actions,
  );
}
