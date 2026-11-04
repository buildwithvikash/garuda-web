// The engine's input controls in the QMAS style: text/number/date inputs, dropdowns, checkboxes,
// image/file uploads, the searchable CheckBoxList, the role TreeView and the guide-file viewer.
import { BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import Section from '@/components/shared/Section.jsx';
import { Field } from '@/components/shared/FormField.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

const maxLen = (c) => (c.maxLength > 0 && c.maxLength < 100000 ? c.maxLength : undefined);
const fileCls = 'block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/5 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/10 cursor-pointer';

/** One engine control under its caption. */
export function EngineField({ c, label, value, onChange }) {
  const id = `f-${c.id}`;
  if (c.type === 'CheckBox') {
    return (
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-2.5 self-end text-sm text-foreground/80 select-none">
        <input type="checkbox" id={id} className="h-5 w-5 rounded accent-primary cursor-pointer" checked={!!value} disabled={c.enabled === false} onChange={(e) => onChange(e.target.checked)} />
        {label || c.text}
      </label>
    );
  }
  const common = { id, disabled: c.enabled === false, readOnly: c.readOnly, required: c.required };
  let input;
  if (c.type === 'DropDownList') {
    input = (
      <NativeSelect {...common} className="cursor-pointer" size={c.listBox ? 5 : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {c.options.map((o, i) => (
          <option key={i} value={o.value}>{o.text}</option>
        ))}
      </NativeSelect>
    );
  } else if (c.inputType === 'textarea') {
    input = <Textarea {...common} className="min-h-20" rows={4} value={value ?? ''} maxLength={maxLen(c)} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const numeric = c.inputType === 'number';
    input = <Input {...common} className={numeric ? 'tabular' : undefined} type={c.inputType} step={c.step} inputMode={numeric ? 'decimal' : undefined} value={value ?? ''} maxLength={maxLen(c)} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Field label={label} required={c.required} id={id} className="min-w-0">
      {input}
    </Field>
  );
}

/** UploadImage user control: a PNG read into a data URL (what its hidden TBImage held). */
export function ImageField({ c, label, value, onChange }) {
  return (
    <div className="min-w-0">
      <span className="text-sm leading-none font-medium">{label}</span>
      {value && <img src={value} alt="" className="mb-2 h-20 rounded-lg border border-border" />}
      <input type="file" accept="image/png" aria-label={label || c.id} className={fileCls} onChange={(e) => e.target.files?.[0] && readAsDataUrl(e.target.files[0], onChange)} />
    </div>
  );
}

/** asp:FileUpload: the picked file as { name, data (base64) }; a postback clears it, as the browser did. */
export function FileField({ c, label, value, onChange }) {
  return (
    <div className="min-w-0">
      <span className="text-sm leading-none font-medium">{label}</span>
      <input
        key={value ? 'picked' : 'empty'}
        type="file"
        aria-label={label || c.id}
        className={fileCls}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return onChange(null);
          readAsDataUrl(f, (url) => onChange({ name: f.name, data: url.split(',')[1] ?? '' }));
        }}
      />
      {value?.name && <p className="mt-1 text-[11px] text-muted-foreground/70">{value.name}</p>}
    </div>
  );
}

/** A titled work panel: the shared Section. */
export const Panel = Section;

/** CheckBoxList, with the page's search box if it has one (case-insensitive "contains"). */
export function CheckList({ c, label, value, onChange, search }) {
  const [q, setQ] = useState('');
  const on = new Set(value ?? []);
  const shown = c.options.filter((o) => q === '' || o.text.toUpperCase().includes(q.toUpperCase()));
  const toggle = (v, checked) => onChange(c.options.map((o) => o.value).filter((x) => (x === v ? checked : on.has(x))));
  return (
    <Panel title={label} actions={<span className="text-[11px] font-medium text-muted-foreground tabular">{on.size} of {c.options.length} selected</span>}>
      {search && <Input className="mb-3 max-w-sm" placeholder="Search" aria-label="Search the list" value={q} onChange={(e) => setQ(e.target.value)} />}
      <ul className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted/50">
              <input type="checkbox" className="h-4 w-4 accent-primary" disabled={c.enabled === false} checked={on.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} /> {o.text}
            </label>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Role TreeView: a click sets all descendants; a checked node checks its ancestors; an unchecked node unchecks its
 *  parent only when all its siblings are unchecked (and so on upwards). */
export function RoleTree({ c, label, value, onChange }) {
  const on = new Set(value ?? []);
  const parents = useMemo(() => {
    const m = new Map();
    const walk = (n, p) => {
      m.set(n.value, p);
      n.children.forEach((x) => walk(x, n));
    };
    (c.nodes ?? []).forEach((n) => walk(n, null));
    return m;
  }, [c.nodes]);
  function toggle(node, checked) {
    const next = new Set(on);
    const all = (n) => [n, ...n.children.flatMap(all)];
    for (const n of all(node)) checked ? next.add(n.value) : next.delete(n.value);
    let state = checked;
    for (let p = parents.get(node.value); p; p = parents.get(p.value)) {
      // a folder stays ticked while one of its pages is, shown or not (p.others: the ones the tree does not show)
      state = state || p.children.some((s) => next.has(s.value)) || (p.others ?? []).some((x) => next.has(x));
      state ? next.add(p.value) : next.delete(p.value);
    }
    onChange([...next]);
  }
  const Node = ({ n }) => (
    <li>
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-foreground/80 hover:bg-muted/50">
        <input type="checkbox" className="h-4 w-4 accent-primary" disabled={c.enabled === false} checked={on.has(n.value)} onChange={(e) => toggle(n, e.target.checked)} /> {n.text}
      </label>
      {n.children.length > 0 && <ul className="ml-5 border-l-2 border-border pl-2">{n.children.map((x) => <Node key={x.value} n={x} />)}</ul>}
    </li>
  );
  return (
    <Panel title={label}>
      <ul className="gap-8 md:columns-2 xl:columns-3">
        {(c.nodes ?? []).map((n) => (
          <div key={n.value} className="break-inside-avoid"><Node n={n} /></div>
        ))}
      </ul>
    </Panel>
  );
}

/** A station's guide file: a PDF, an AutoCAD drawing (sharecad viewer) or an image. */
export const GuideView = ({ g }) => (
  <Panel title={<span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> Guide</span>}>
    {g.kind === 'png' ? (
      <img src={g.url} alt="Guide" className="max-h-[70vh] rounded-lg" />
    ) : (
      <iframe title="Guide file" className="h-[70vh] w-full rounded-lg" src={g.kind === 'dwg' ? `//sharecad.org/cadframe/load?url=${g.url}` : g.url} allowFullScreen />
    )}
  </Panel>
);
