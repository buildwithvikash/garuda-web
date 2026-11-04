// RM Replacement (sidebar: Production › RM Replacement): replace a raw material component in a unit. It opens on the
// history of replacements; ?view=replace is the form, so a refresh stays on it.
//   RmReplacement/Form.jsx             the form
//   RmReplacement/List.jsx             the history
//   RmReplacement/useReplacement.js    the form's state and server calls
//   RmReplacement/replacementsApi.js   /api/production/rm-replacements
import { ArrowLeft, Plus, RefreshCcw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import ReplacementHistory from './RmReplacement/List.jsx';
import ReplacementForm from './RmReplacement/Form.jsx';

export const route = '/production/rmreplacementform';

export default function RmReplacement() {
  const [params, setParams] = useSearchParams();
  const replacing = params.get('view') === 'replace';
  return (
    <Page
      icon={RefreshCcw}
      title="RM Replacement"
      subtitle={replacing ? 'Replace a raw material in a unit: scan the unit, choose the old component, scan the new one' : 'Components replaced in units, newest first'}
      actions={
        replacing ? (
          <Button size="sm" variant="outline" icon={ArrowLeft} onClick={() => setParams({})}>Back to list</Button>
        ) : (
          <Button size="sm" icon={Plus} onClick={() => setParams({ view: 'replace' })}>Replace a component</Button>
        )
      }
    >
      {replacing ? <ReplacementForm /> : <ReplacementHistory />}
    </Page>
  );
}
