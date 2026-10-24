// WIP Capture
// Sidebar: Production › WIP Capture. The scan-first station screen; its parts live in src/features/wip-capture.
// The page loads the screen's first state from the server and hands it to <Station>; every button still runs the
// same WIPCaptureForm handler on the server (/forms/event).
import Page from '@/components/shared/Page.jsx';
import Loader from '@/components/shared/Loader.jsx';
import { FormError } from '@/components/shared/FormField.jsx';
import { useSpec } from '@/components/shopfloor';
import Station from '@/features/wip-capture/components/Station.jsx';
import { header, route as ROUTE } from '@/features/wip-capture/constants.js';

export const route = '/production/wipcaptureform';

export default function WipCapture() {
  const { spec, error } = useSpec(ROUTE);
  if (spec) return <Station spec={spec} />;
  return (
    <Page {...header}>
      <FormError message={error} />
      {!error && <Loader />}
    </Page>
  );
}
