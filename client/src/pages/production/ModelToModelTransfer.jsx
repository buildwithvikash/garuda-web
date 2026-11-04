// Model To Model Transfer (sidebar: Production › Model To Model Transfer): FG units moved to another model by a list of
// their serials (owner, 29 Oct 2026). The serials are grouped by product, each product gets its destination, then each
// unit is moved and its label printed again.
//   ModelToModelTransfer/BulkTransfer.jsx   serials, grouped, then transferred
//   ModelToModelTransfer/List.jsx           the history (?view=history, kept on a refresh)
//   ModelToModelTransfer/transfersApi.js    /api/production/model-transfers
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, History as HistoryIcon, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import BulkTransfer from './ModelToModelTransfer/BulkTransfer.jsx';
import TransferHistory from './ModelToModelTransfer/List.jsx';
import { transfersApi } from './ModelToModelTransfer/transfersApi.js';

export const route = '/production/modeltomodeltransferform';

export default function ModelToModelTransfer() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const history = params.get('view') === 'history';

  useEffect(() => {
    transfersApi.options()
      .then(setOptions)
      .catch((e) => (setError(e.message), toast.error(e.message, { id: e.message, duration: 6000 })));
  }, []);

  const tab = (h, label, icon) => (
    <Button size="sm" role="tab" aria-selected={history === h} variant={history === h ? 'default' : 'outline'} icon={icon} onClick={() => setParams(h ? { view: 'history' } : {}, { replace: true })}>
      {label}
    </Button>
  );
  return (
    <Page
      icon={ArrowLeftRight}
      title="Model To Model Transfer"
      subtitle={history ? 'The transfers done so far' : 'Move FG units to another model by their serials; they are grouped by product first'}
      actions={
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Model To Model Transfer views">
          {tab(false, 'Transfer', ArrowLeftRight)}
          {tab(true, 'Transfer history', HistoryIcon)}
        </div>
      }
    >
      {history ? (
        <TransferHistory />
      ) : !options ? (
        error ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />
      ) : (
        <BulkTransfer options={options} />
      )}
    </Page>
  );
}
