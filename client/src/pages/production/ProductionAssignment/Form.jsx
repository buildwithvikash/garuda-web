// Production Assignment: start a production order at its routing's first stage and print its job cards. Plain React:
// the fields are this screen's own; the state and server calls are in ./useAssignment.js.
import { Boxes, ClipboardList, Factory, PackageMinus, PackagePlus, Printer, Route, RotateCw } from 'lucide-react';
import DataTable from '@/components/shared/DataTable.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { LockedValue, Step } from '@/components/shared/FormStep.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
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

/** one of the order's lines (routing stages, BOM input / output), read-only */
const Lines = ({ id, rows, cols, empty }) => <DataTable tableId={id} columns={cols} rows={rows.map((r, i) => ({ id: i, ...r }))} empty={empty} exportName={id} />;

export default function AssignmentForm() {
  const { screen, loadError, errors, busy, setField, print } = useAssignment();

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

  const { assignment: a, options, ui, details, left } = screen;
  // the server's lists ({ value, text }) as the Select takes them, and the name of a chosen value
  const opts = (field) => (options[field] ?? []).map((o) => ({ value: o.value, label: o.text }));
  const nameOf = (field) => (options[field] ?? []).find((o) => o.value === a[field])?.text ?? a[field];
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
            <LockedValue label="Order quantity" value={a.totalQty} />
            <LockedValue label="Order unit" value={nameOf('totalUom')} />
            <TextInput
              label="Quantity to start"
              required
              inputMode="decimal"
              value={a.qty ?? ''}
              onChange={(e) => setField('qty', e.target.value)}
              disabled={!ui.qtyEditable}
              error={errors.qty}
              hint={left !== '' && left != null ? `Left to assign at this stage: ${left}` : undefined}
            />
            <LockedValue label="Unit" value={nameOf('uom')} />
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
            <Button type="submit" icon={Printer} loading={busy === 'print'} disabled={busy !== null} className="h-10 px-5">
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
