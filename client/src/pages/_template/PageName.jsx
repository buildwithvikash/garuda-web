// ════════════════════════════════════════════════════════════════════════════════
//  TEMPLATE for a hand-built page (a report, a dashboard, a custom screen).
//  Copy to src/pages/<group>/<PageName>.jsx (group = first part of the sidebar route) and edit.
//
//  Like every page it is ONE FILE: its data loading, state, handlers, small helper
//  components and layout all live here. Only the UI pieces are shared:
//     @/components/ui      shadcn (Button, Input, Card, Table, Dialog ...)
//     @/components/shared  Page, Section, DataTable, Modal, StatCard, EmptyState ...
//
//  Wiring: `route` must equal the sidebar route (lower case, as the server lists it). That is all.
//  For a page that shows the server-described form/list screen, use `npm run page` instead:
//  it creates a complete page file for you.
// ════════════════════════════════════════════════════════════════════════════════
import { Download, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import DataTable from '@/components/shared/DataTable.jsx';
import Page from '@/components/shared/Page.jsx';
import Section from '@/components/shared/Section.jsx';
import StatCard from '@/components/shared/StatCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { downloadCsv } from '@/utils/csv.js';

export const route = '/group/pagenameform';

// 1. SETTINGS ───────────────────────────────────────────────────────────────────
const TITLE = 'Page title';
const ENDPOINT = '/your/endpoint'; // the backend call this page makes
const COLUMNS = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name', sortable: true },
  { key: 'status', header: 'Status' },
];

// 2. PAGE ───────────────────────────────────────────────────────────────────────
export default function PageName() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await api(ENDPOINT)) ?? []);
    } catch (e) {
      setError(e);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))) : rows;
  }, [rows, search]);

  return (
    <Page
      title={TITLE}
      subtitle="One line about this page"
      actions={
        <>
          <Button variant="outline" size="sm" icon={Download} onClick={() => downloadCsv('export', COLUMNS, shown)} disabled={!shown.length}>
            Export
          </Button>
          <Button size="sm" icon={RefreshCw} loading={loading} onClick={load}>
            Refresh
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Records" value={rows.length} />
        <StatCard label="Shown" value={shown.length} />
      </div>

      <Section title="Records" flush>
        <DataTable
          columns={COLUMNS}
          rows={shown}
          loading={loading}
          error={error}
          leading={
            <div className="relative w-64">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          }
        />
      </Section>
    </Page>
  );
}
