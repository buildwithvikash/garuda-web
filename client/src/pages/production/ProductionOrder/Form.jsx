// Production Order: one order (new or saved). Plain React: the fields are this screen's own, the state and server
// calls are in ./useOrderForm.js.
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
import { useOrderForm } from './useOrderForm.js';

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

/** prodNo: the saved order to open (shown read-only: an order cannot be changed once created), or null for a new one.
 *  onSaved(message) after the order is created. */
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
    if (dirty && !(await askConfirm({ title: 'Leave without saving?', message: 'Your changes on this form will be lost.', confirmLabel: 'Leave', variant: 'danger' }))) return;
    onBack();
  }

  async function submit(e) {
    e.preventDefault();
    const r = await save();
    if (r) onSaved(r.message || 'Record Created Successfully');
  }

  const shell = (children, actions) => (
    <Page icon={ClipboardList} title="Production Order" subtitle={isNew ? 'Create a production order: product, quantity and materials' : 'A saved order: it cannot be changed'} actions={actions}>
      {children}
    </Page>
  );
  const backButton = (
    <Button type="button" variant="outline" icon={ArrowLeft} className="h-10" onClick={back}>
      Back to list
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
  const select = (field, label, extra = {}) => (
    <Select label={label} value={order[field]} options={opts(field)} onChange={(v) => setField(field, v ?? '')} error={errors[field]} {...extra} />
  );
  const text = (field, label, extra = {}) => (
    <TextInput label={label} value={order[field] ?? ''} onChange={(e) => setField(field, e.target.value)} error={errors[field]} {...extra} />
  );

  const actions = (
    <div className="flex flex-wrap items-end gap-3">
      <span className="hidden items-center gap-2 self-center xl:inline-flex">
        <Badge variant={isNew ? 'info' : 'neutral'} dot>{isNew ? 'New record' : 'Saved — cannot be changed'}</Badge>
        {dirty && <Badge variant="warning" dot>Unsaved changes</Badge>}
      </span>
      {backButton}
      <div className="w-56">{select('department', 'Department', { required: true, disabled: !isNew })}</div>
      {/* a new order takes the default status (Active); it shows once the order is saved */}
      {!isNew && <div className="w-56">{select('status', 'Record status', { disabled: true })}</div>}
      {isNew && (
        <Button type="submit" form={formId} icon={Save} loading={busy === 'save'} disabled={busy !== null} className="h-10 px-5">
          Create Order
        </Button>
      )}
    </div>
  );

  return shell(
    <form id={formId} onSubmit={submit} noValidate>
      {/* a saved order is shown, not edited */}
      <fieldset disabled={!isNew} className="grid min-w-0 items-start gap-2">
      <Step n={1} tone="blue" icon={ClipboardList} title="Order Details" subtitle="Basic information about the production order">
        <div className={GRID_2}>
          <LockedValue label="Order code" value={/^0?$/.test(order.prodNo) ? '' : order.prodNo} placeholder="Auto-generated" className="sm:col-span-2" />
          <LockedValue label="Alias" value={order.alias} className="sm:col-span-2" />
          <LockedValue label="Order date" value={order.orderDate} />
          {select('orderType', 'Order Type')}
          {select('priority', 'Priority')}
          {ui.salesOrder && select('salesOrder', 'Sales Order')}
        </div>
      </Step>

      <Step n={2} tone="emerald" icon={Package} title="Product & Quantity" subtitle="Select the product and define the production quantity">
        <div className={GRID_2}>
          {select('material', 'Material')}
          {select('bom', 'BOM')}
          {/* a sales order's own quantity: shown, never saved */}
          {ui.orderQty && <LockedValue label="Order quantity" value={order.totalQty} />}
          {ui.orderQty && <LockedValue label="Order unit" value={opts('totalUom').find((o) => o.value === order.totalUom)?.label ?? order.totalUom} />}
          {text('qty', 'Production quantity', { required: true, inputMode: 'decimal', disabled: !ui.qtyEditable })}
          {select('uom', 'Unit')}
        </div>
      </Step>

      {/* a serial-tracked material (or a sales order) has a track ID */}
      {ui.track && (
        <Step n={3} tone="violet" icon={Tag} title="Tracking" subtitle="Tracking information for this order">
          <div className={GRID_2}>
            {text('trackId', 'Track ID', { className: 'sm:col-span-2', maxLength: 50 })}
            {text('custId', 'Customer ID', { className: 'sm:col-span-2', maxLength: 50 })}
          </div>
        </Step>
      )}
      </fieldset>
    </form>,
    actions,
  );
}
