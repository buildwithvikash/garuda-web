// TEMPLATE. Copy to src/pages/<group>/<PageName>.jsx (group = first part of the sidebar route) and edit.
// Or let the script do it:  npm run page -- /production/productionguideform "Production Guide"
//
// `route` must equal the sidebar route (lower case, exactly as the server lists it). That is the only wiring:
// the file is found, routed and code-split automatically.
//
// A page is either
//   A) an engine screen (fields come from the server's form spec), exactly like the generated pages:
//        return <EngineScreen path={route} />;
//   B) a custom screen built from the shadcn components, like below. Call the backend with `api` as the other pages do.
import { Factory } from 'lucide-react';
import { Page, Section } from '@/components/shared';
import { Button } from '@/components/ui/button.jsx';
// import { api } from '@/api.js';

export const route = '/group/pagenameform';

export default function PageName() {
  return (
    <Page icon={Factory} title="Page title" subtitle="One line about this page" actions={<Button size="sm">Action</Button>}>
      <Section title="Section title">Content goes here.</Section>
    </Page>
  );
}
