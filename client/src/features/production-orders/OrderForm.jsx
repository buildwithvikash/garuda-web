// One production order: header, product and quantity, tracking, service-request lines. Choosing a material, an order
// type or a sales order asks the server what it fills (units, BOM, track ID, lists), as the original screen did.
import { ArrowLeft, BadgeCheck, Boxes, Building2, CalendarDays, ClipboardList, Flag, Hash, Layers, Plus, Save, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { askConfirm } from '@/app/confirm.js';
import { FormError, Loader, Modal, ModalFooter, SearchSelect, Section, Select, TextArea, TextInput, Toolbar } from '@/components/shared';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { addServiceRequest, blankOrder, cancelOrder, changeOrder, createOrder, getOrder, saveOrder } from './ordersApi.js';

const CANCELLED = '200';
const opts = (list) => (list ?? []).map((o) => ({ value: o.value, label: o.text }));

export default function OrderForm({ prodNo, onBack, onSaved }) {
  const [form, setForm] = useState(null); // { order, options, ui }
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null); // the reason being typed, or null
  const saved = useRef('');

  useEffect(() => {
    (prodNo ? getOrder(prodNo) : blankOrder()).then(
      (f) => (setForm(f), (saved.current = JSON.stringify(f.order))),
      (e) => setError(e.message),
    );
  }, [prodNo]);

  if (!form) return error ? <FormError message={error} /> : <Loader />;
  const { order, options, ui } = form;
  const isNew = !order.prodNo || order.prodNo === '0';
  const cancelled = order.status === CANCELLED;
  const statusLabel = opts(options.status).find((item) => item.value === order.status)?.label ?? 'Open';
  const dirty = JSON.stringify(order) !== saved.current;
  const err = (f) => errors[f]?.replace(/^\w+ /, '');

  // editing a field clears its message
  const clearError = (field) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  const set = (field) => (value) => (clearError(field), setForm((f) => ({ ...f, order: { ...f.order, [field]: value ?? '' } })));
  /** the server's patch merged in */
  const merge = (p) => {
    setForm((f) => ({ order: { ...f.order, ...p.order }, options: { ...f.options, ...p.options }, ui: { ...f.ui, ...p.ui } }));
    if (p.message) setError(p.message);
  };
  async function choose(field, value) {
    clearError(field);
    const next = { ...order, [field]: value ?? '' };
    setForm((f) => ({ ...f, order: next }));
    setBusy(true);
    setError('');
    try {
      merge(await changeOrder(field, next));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function addLine() {
    setBusy(true);
    setError('');
    try {
      merge(await addServiceRequest(order));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const removeLine = (i) => setForm((f) => ({ ...f, order: { ...f.order, orders: f.order.orders.filter((_, j) => j !== i) } }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const r = isNew ? await createOrder(order) : await saveOrder(order.prodNo, order);
      toast.success(isNew ? `Production order ${r.prodNo} created` : 'Production order updated');
      saved.current = JSON.stringify(order);
      onSaved(r.prodNo);
    } catch (e2) {
      setError(e2.message);
      setErrors(e2.data?.errors ?? {});
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await cancelOrder(order.prodNo, deleting);
      toast.success('Production order cancelled');
      onBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }
  async function back() {
    if (dirty && !(await askConfirm({ title: 'Leave without saving?', message: 'Your changes to this order will be lost.', confirmLabel: 'Leave', variant: 'destructive' }))) return;
    onBack();
  }

  const lock = cancelled || busy;
  // saved tracking data is shown even where the screen would keep the panel closed
  const showTrack = ui.track || order.trackId !== '' || order.custId !== '';
  return (
    <form className="space-y-5 pb-2" onSubmit={submit}>
      <Toolbar sticky={false} className="px-3 py-3 sm:px-4">
        <div className="grid w-full items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3 self-center">
            <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>Orders</Button>
            <span aria-hidden="true" className="h-9 w-px shrink-0 bg-border" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Order ID</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold">{isNew ? 'New production order' : order.alias || `PO${order.prodNo}`}</p>
                {isNew ? <Badge variant="secondary">Draft</Badge> : cancelled ? <Badge variant="destructive">Cancelled</Badge> : <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{statusLabel}</Badge>}
              </div>
              {!isNew && <p className="truncate text-xs text-muted-foreground">Production order {order.prodNo}</p>}
              {dirty && !cancelled && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes</p>}
            </div>
          </div>
          <TextInput label="Order date" type="date" required value={order.orderDate} onChange={(e) => set('orderDate')(e.target.value)} error={err('orderDate')} />
          <Select label="Record status" required options={opts(options.status)} value={order.status} onChange={set('status')} error={err('status')} />
          <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-1">
            {!isNew && !cancelled && <Button type="button" variant="outline" icon={Trash2} onClick={() => setDeleting('')}>Delete</Button>}
            {!cancelled && <Button type="submit" icon={Save} loading={busy}>{isNew ? 'Save order' : 'Update'}</Button>}
          </div>
        </div>
      </Toolbar>

      <FormError message={error} />

      <fieldset disabled={lock} className="grid items-start gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <Section icon={ClipboardList} title="Order information" description="Set the department, order type and priority.">
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              <Select label="Department" required options={opts(options.department)} value={order.department} onChange={set('department')} error={err('department')} />
              <Select label="Order type" options={opts(options.orderType)} value={order.orderType} onChange={(v) => choose('orderType', v)} error={err('orderType')} />
              <Select label="Priority" options={opts(options.priority)} value={order.priority} onChange={set('priority')} error={err('priority')} />
              {ui.salesOrder && <Select label="Sales order" className="sm:col-span-2 xl:col-span-3" options={opts(options.salesOrder)} value={order.salesOrder} onChange={(v) => choose('salesOrder', v)} error={err('salesOrder')} />}
            </div>
          </Section>

          <Section icon={Boxes} title="Product and quantity" description="Choose what to make and how much.">
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <SearchSelect label="Material" showFilter={false} showMatchCount={false} className="sm:col-span-2" options={opts(options.material)} value={order.material} onChange={(v) => choose('material', v)} error={err('material')} />
              <SearchSelect label="Bill of materials (BOM)" showFilter={false} showMatchCount={false} className="sm:col-span-2" options={opts(options.bom)} value={order.bom} onChange={set('bom')} error={err('bom')} />
              {ui.orderQty && (
                <>
                  <TextInput label="Order quantity" inputMode="decimal" value={order.totalQty} onChange={(e) => set('totalQty')(e.target.value)} error={err('totalQty')} />
                  <Select label="Order unit" options={opts(options.totalUom)} value={order.totalUom} onChange={set('totalUom')} />
                </>
              )}
              <TextInput label="Production quantity" required inputMode="decimal" className="tabular-nums" disabled={!ui.qtyEditable} value={order.qty} onChange={(e) => set('qty')(e.target.value)} error={err('qty')} />
              <Select label="Unit" options={opts(options.uom)} value={order.uom} onChange={set('uom')} error={err('uom')} />
            </div>
          </Section>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <Section icon={Tag} title="Tracking and notes" description="Optional customer references and instructions.">
            <div className="grid gap-4">
              {showTrack && <TextInput label="Track ID" value={order.trackId} onChange={(e) => set('trackId')(e.target.value)} error={err('trackId')} />}
              {showTrack && <TextInput label="Customer ID" value={order.custId} onChange={(e) => set('custId')(e.target.value)} error={err('custId')} />}
              <TextArea label="Remark" rows={4} value={order.remark} onChange={(e) => set('remark')(e.target.value)} error={err('remark')} />
            </div>
          </Section>
          <Section icon={BadgeCheck} title="Order summary" description="Quick overview of this order." className="border-primary/15 bg-primary/[0.025]">
            <div className="grid grid-cols-2 gap-2">
              <SummaryItem icon={CalendarDays} label="Order date" value={order.orderDate || '—'} />
              <SummaryItem icon={BadgeCheck} label="Record status" value={statusLabel} />
              <SummaryItem icon={Building2} label="Department" value={opts(options.department).find((item) => item.value === order.department)?.label} />
              <SummaryItem icon={Layers} label="Order type" value={opts(options.orderType).find((item) => item.value === order.orderType)?.label} />
              <SummaryItem icon={Flag} label="Priority" value={opts(options.priority).find((item) => item.value === order.priority)?.label} />
              {showTrack && <SummaryItem icon={Hash} label="Track ID" value={order.trackId} />}
            </div>
          </Section>
        </div>

        {(order.orderType === '4' || order.orders.length > 0) && (
          <Section icon={ClipboardList} title="Service requests" description="Add any service work linked to this production order." flush className="lg:col-span-12">
            {order.orderType === '4' && (
              <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-end">
                <Select label="Service request" className="sm:min-w-72 sm:max-w-md" options={opts(options.serviceRequest)} value={order.serviceRequest} onChange={set('serviceRequest')} />
                <Button type="button" variant="outline" icon={Plus} loading={busy} onClick={addLine}>Add request</Button>
              </div>
            )}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Order no.</th><th className="px-4 py-2">Code</th><th className="w-12" aria-label="Remove" /></tr>
              </thead>
              <tbody className="divide-y">
                {order.orders.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No service requests yet. Add one above if this order needs service work.</td></tr>}
                {order.orders.map((l, i) => (
                  <tr key={`${l.orderCode}-${i}`} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{l.seqNo}</td>
                    <td className="px-4 py-3 font-medium">{l.orderNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.orderCode}</td>
                    <td className="px-2"><Button type="button" variant="ghost" size="icon" icon={X} aria-label={`Remove ${l.orderNo}`} onClick={() => removeLine(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Section>
        )}
      </fieldset>

      {deleting !== null && (
        <Modal
          title="Delete this production order?"
          subtitle="The order is cancelled, not erased. Give the reason; it is kept with the order."
          size="sm"
          onClose={() => setDeleting(null)}
          footer={<ModalFooter onCancel={() => setDeleting(null)} onSave={remove} saveLabel="Delete" saveVariant="destructive" saving={busy} />}
        >
          <TextInput label="Reason for deleting" value={deleting} onChange={(e) => setDeleting(e.target.value)} autoFocus />
        </Modal>
      )}
    </form>
  );
}

function SummaryItem({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/80 p-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-semibold" title={value || ''}>{value || '—'}</p>
      </div>
    </div>
  );
}
