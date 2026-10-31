// Production Order: one order (new or saved). Plain React: the fields are this screen's own, the state and server
// calls are in ./useOrderForm.js, every text is in ./texts.js.
import { useEffect, useId } from 'react';
import { ArrowLeft, ClipboardList, Lock, Package, RotateCw, Save, Tag } from 'lucide-react';
import { askConfirm } from '@/app/confirm.js';
import { Field, Select, TextInput } from '@/components/shared/FormField.jsx';
import { Step } from '@/components/shared/FormStep.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';
import { TEXTS } from './texts.js';
import { useOrderForm } from './useOrderForm.js';

const L = TEXTS.fields;
const GRID_2 = 'grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4';

/** a field the server sets and keeps (the order's number, its alias, today's date) */
function LockedValue({ label, value, placeholder, className }) {
  const id = useId();
  return (
    <Field label={label} id={id} className={cn('min-w-0', className)}>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} readOnly value={value ?? ''} placeholder={placeholder} className="bg-muted/60 pl-9 text-muted-foreground" />
      </div>
    </Field>
  );
}

/** prodNo: the saved order to open, or null for a new one. onSaved(message) after a successful Save / Update. */
export default function OrderForm({ prodNo, onBack, onSaved }) {
  const formId = useId();
  const { form, loadError, errors, busy, dirty, setField, save } = useOrderForm(prodNo);
  const isNew = !prodNo;

  // closing or reloading the tab with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function back() {
    if (dirty && !(await askConfirm({ title: TEXTS.leaveTitle, message: TEXTS.leaveMessage, confirmLabel: TEXTS.leave, variant: 'danger' }))) return;
    onBack();
  }

  async function submit(e) {
    e.preventDefault();
    const r = await save();
    if (r) onSaved(r.message || (isNew ? TEXTS.created : TEXTS.updated));
  }

  const shell = (children, actions) => (
    <Page icon={ClipboardList} title={TEXTS.title} subtitle={TEXTS.formSubtitle} actions={actions}>
      {children}
    </Page>
  );
  const backButton = (
    <Button type="button" variant="outline" icon={ArrowLeft} className="h-10" onClick={back}>
      {TEXTS.back}
    </Button>
  );

  if (loadError)
    return shell(
      <div className="flex flex-col items-start gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button>
      </div>,
      backButton,
    );
  if (!form) return shell(<Loader />);

  const { order, options, ui } = form;
  // the server's lists ({ value, text }) as the Select takes them
  const opts = (field) => (options[field] ?? []).map((o) => ({ value: o.value, label: o.text }));
  const select = (field, extra = {}) => (
    <Select label={L[field]} value={order[field]} options={opts(field)} onChange={(v) => setField(field, v ?? '')} error={errors[field]} {...extra} />
  );
  const text = (field, extra = {}) => (
    <TextInput label={L[field]} value={order[field] ?? ''} onChange={(e) => setField(field, e.target.value)} error={errors[field]} {...extra} />
  );

  const actions = (
    <div className="flex flex-wrap items-end gap-3">
      <span className="hidden items-center gap-2 self-center xl:inline-flex">
        <Badge variant={isNew ? 'info' : 'neutral'} dot>{isNew ? TEXTS.newRecord : TEXTS.savedRecord}</Badge>
        {dirty && <Badge variant="warning" dot>{TEXTS.unsaved}</Badge>}
      </span>
      {backButton}
      <div className="w-56">{select('department', { required: true })}</div>
      {/* a new order takes the default status (Active); it shows once the order is saved */}
      {!isNew && <div className="w-56">{select('status', { required: true })}</div>}
      <Button type="submit" form={formId} icon={Save} loading={busy === 'save'} disabled={busy !== null} className="h-10 px-5">
        {isNew ? TEXTS.create : TEXTS.update}
      </Button>
    </div>
  );

  return shell(
    <form id={formId} onSubmit={submit} className="grid items-start gap-2" noValidate>
      <Step n={1} tone="blue" icon={ClipboardList} title={TEXTS.steps.details.title} subtitle={TEXTS.steps.details.subtitle}>
        <div className={GRID_2}>
          <LockedValue label={L.prodNo} value={/^0?$/.test(order.prodNo) ? '' : order.prodNo} placeholder={TEXTS.autoGenerated} className="sm:col-span-2" />
          <LockedValue label={L.alias} value={order.alias} className="sm:col-span-2" />
          <LockedValue label={L.orderDate} value={order.orderDate} />
          {select('orderType')}
          {select('priority')}
          {ui.salesOrder && select('salesOrder')}
        </div>
      </Step>

      <Step n={2} tone="emerald" icon={Package} title={TEXTS.steps.product.title} subtitle={TEXTS.steps.product.subtitle}>
        <div className={GRID_2}>
          {select('material')}
          {select('bom')}
          {/* a sales order's own quantity: shown, never saved */}
          {ui.orderQty && <LockedValue label={L.totalQty} value={order.totalQty} />}
          {ui.orderQty && <LockedValue label={L.totalUom} value={opts('totalUom').find((o) => o.value === order.totalUom)?.label ?? order.totalUom} />}
          {text('qty', { required: true, inputMode: 'decimal', disabled: !ui.qtyEditable })}
          {select('uom')}
        </div>
      </Step>

      {/* a serial-tracked material (or a sales order) has a track ID */}
      {ui.track && (
        <Step n={3} tone="violet" icon={Tag} title={TEXTS.steps.tracking.title} subtitle={TEXTS.steps.tracking.subtitle}>
          <div className={GRID_2}>
            {text('trackId', { className: 'sm:col-span-2', maxLength: 50 })}
            {text('custId', { className: 'sm:col-span-2', maxLength: 50 })}
          </div>
        </Step>
      )}
    </form>,
    actions,
  );
}
