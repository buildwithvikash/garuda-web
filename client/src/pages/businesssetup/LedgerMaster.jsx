// Ledger Master (sidebar: Business Setup › Ledger Master): the ledgers (customers, vendors ...), or one open. Plain page
// on /api/masters/ledgers.
import { BookUser, Settings2 } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/businesssetup/ledgerform';

const sections = [
  {
    title: 'Ledger', subtitle: 'Who the ledger is', icon: BookUser,
    fields: [
      { f: 'ledgerCode', label: 'Code', kind: 'key' },
      { f: 'name', label: 'Name', max: 100 },
      { f: 'alias', label: 'Alias' },
      { f: 'ledgerGroup', label: 'Ledger Group', kind: 'select' },
      { f: 'webSite', label: 'WebSite', max: 100, span: 2 },
    ],
  },
  {
    title: 'Settings', subtitle: 'Department and transactions', icon: Settings2,
    fields: [
      { f: 'department', label: 'Department', kind: 'select' },
      { f: 'controlIndicator', label: 'Ledger Transaction', kind: 'select' },
      { f: 'prefix', label: 'Prefix', max: 10 },
    ],
  },
];

export default function LedgerMaster() {
  return <MasterScreen name="ledgers" title="Ledger Master" icon={BookUser} subtitle="A customer, vendor or other ledger" sections={sections} />;
}
