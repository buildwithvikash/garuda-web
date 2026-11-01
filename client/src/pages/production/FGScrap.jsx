// FG Scrap (sidebar: Production › FG Scrap): take a finished unit out of production. It opens on the history of scraps;
// ?view=scrap is the form, so a refresh stays on it.
//   FGScrap/Form.jsx       the form
//   FGScrap/List.jsx       the history
//   FGScrap/useScrap.js    the form's state and server calls
//   FGScrap/scrapsApi.js   /api/production/fg-scrap
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import ScrapHistory from './FGScrap/List.jsx';
import ScrapForm from './FGScrap/Form.jsx';

export const route = '/production/fgscrapform';

export default function FGScrap() {
  const [params, setParams] = useSearchParams();
  const scrapping = params.get('view') === 'scrap';
  return (
    <Page
      icon={Trash2}
      title="FG Scrap"
      subtitle={scrapping ? 'Scan the unit, give the category and remark, then save' : 'Units and items scrapped, newest first'}
      actions={
        scrapping ? (
          <Button size="sm" variant="outline" icon={ArrowLeft} onClick={() => setParams({})}>Back to list</Button>
        ) : (
          <Button size="sm" icon={Plus} onClick={() => setParams({ view: 'scrap' })}>Scrap a unit</Button>
        )
      }
    >
      {scrapping ? <ScrapForm /> : <ScrapHistory />}
    </Page>
  );
}
