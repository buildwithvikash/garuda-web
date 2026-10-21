// An engine screen (forms.json spec): its saved records (list) or one record (form), under the QMAS page header.
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useMe } from '../../layouts/AppLayout.jsx';
import { screenOf } from '../../layouts/nav.js';
import Button from '../../ui/Button.jsx';
import { FormError } from '../../ui/fields.jsx';
import Loader from '../../ui/Loader.jsx';
import PageHeader from '../../ui/PageHeader.jsx';
import RecordForm from './RecordForm.jsx';
import RecordList from './RecordList.jsx';
import { LAYOUTS } from '../flow/layouts.js';

const enc = encodeURIComponent;

export default function EngineForm({ path }) {
  const me = useMe();
  const { pathname } = useLocation();
  const screen = me ? screenOf(me.menu, pathname) : null;
  const [spec, setSpec] = useState(null);
  const [view, setView] = useState({ kind: 'list' });
  const [error, setError] = useState('');
  const [seq, setSeq] = useState(0);
  const [listFilter, setListFilter] = useState({});
  const show = (v) => {
    setError('');
    setSeq((n) => n + 1); // a fresh form each time, never on unrelated re-renders
    setView(v);
  };

  useEffect(() => {
    setSpec(null);
    api(`/forms/spec?path=${enc(path)}`)
      .then((s) => {
        setSpec(s);
        show(s.startOnList ? { kind: 'list' } : { kind: 'form', mode: 'new', state: s });
      })
      .catch((e) => setError(e.message));
  }, [path]);

  const run = (p) => p.catch((e) => setError(e.message));
  const open = (key, notice) => run(api(`/forms/record?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'edit', state, notice })));
  // the "new" state is rebuilt each time (ClearForm: today's date, refreshed lists)
  const fresh = (notice) => run(api(`/forms/spec?path=${enc(path)}`).then((state) => show({ kind: 'form', mode: 'new', state, notice })));
  const copy = (key) => run(api(`/forms/copy?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'new', state })));

  const layout = LAYOUTS[path];
  const title = spec?.title || screen?.caption || 'Screen';
  return (
    <>
      <PageHeader icon={layout?.icon ?? screen?.group.icon} title={title} subtitle={view.kind === 'list' && spec ? 'Saved records — click one to open it' : layout?.subtitle}>
        {spec && view.kind === 'list' && spec.buttons.add && <Button size="sm" icon={Plus} onClick={() => fresh()}>Add new</Button>}
      </PageHeader>
      <div className="p-4 space-y-3 animate-page">
        <FormError message={error} />
        {!spec ? (
          !error && <Loader />
        ) : view.kind === 'list' ? (
          <RecordList path={path} spec={spec} onOpen={open} filter={listFilter} />
        ) : (
          <RecordForm
            key={seq}
            path={path}
            state={view.state}
            mode={view.mode}
            notice={view.notice}
            buttons={spec.buttons}
            callNewOnSave={spec.callNewOnSave}
            copyOptions={spec.copyOptions}
            print={spec.print}
            printers={spec.printers}
            onReload={(key, notice) => open(key, notice)}
            events={spec.events ?? []}
            onCopy={copy}
            onBack={() => show({ kind: 'list' })}
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
          />
        )}
      </div>
    </>
  );
}
