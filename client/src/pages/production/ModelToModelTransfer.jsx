// ════════════════════════════════════════════════════════════════════════════════
//  Model To Model Transfer
//  Sidebar: Production › Model To Model Transfer
//
//  By a list of FG serials only (owner, 29 Oct 2026): the serials are grouped by their product, each product gets its
//  destination, then each unit is moved and its label printed again. The original's serial range is no longer a form
//  of its own: it fills the list (Transfer, "Add a serial range"). The transfers so far are the history.
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    ModelToModelTransfer.jsx                the page: Transfer, or the history (?view=history, kept on a refresh)
//    ModelToModelTransfer/BulkTransfer.jsx   serials (typed, pasted or from a range), grouped, then transferred
//    ModelToModelTransfer/List.jsx           the transfer history (the screen's saved records), read only
//  Server: production/model-transfer-bulk.js (/api/production/model-transfers/bulk); the screen's spec gives the
//  material and printer lists, its list the history.
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, History as HistoryIcon, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import BulkTransfer from './ModelToModelTransfer/BulkTransfer.jsx';
import RecordList from './ModelToModelTransfer/List.jsx';

export const route = '/production/modeltomodeltransferform';

export default function ModelToModelTransfer() {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const history = params.get('view') === 'history';

  useEffect(() => {
    screenApi(route)
      .spec()
      .then(setSpec)
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
      title={spec?.title || 'Model To Model Transfer'}
      subtitle={history ? 'The transfers done so far' : 'Move FG units to another model by their serials; they are grouped by product first'}
      actions={
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Model To Model Transfer views">
          {tab(false, 'Transfer', ArrowLeftRight)}
          {tab(true, 'Transfer history', HistoryIcon)}
        </div>
      }
    >
      {!spec ? (
        error ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />
      ) : history ? (
        <RecordList path={route} spec={spec} />
      ) : (
        <BulkTransfer spec={spec} />
      )}
    </Page>
  );
}
