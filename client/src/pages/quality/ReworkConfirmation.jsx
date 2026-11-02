// Rework Confirmation (sidebar: Quality › Rework Confirmation): scan a unit sent to rework, see its inspection, confirm the
// repair. ?view=list: the units waiting in the department; a row opens the unit here.
//   ReworkConfirmation/Form.jsx        the form
//   ReworkConfirmation/useRework.js    the form's state and server calls
//   ReworkConfirmation/reworkApi.js    /api/quality/rework-confirmations
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, List as ListIcon, RefreshCcw, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import RecordsList from '@/components/shared/RecordsList.jsx';
import { Button } from '@/components/ui/button.jsx';
import ReworkForm from './ReworkConfirmation/Form.jsx';
import { reworkApi } from './ReworkConfirmation/reworkApi.js';

export const route = '/quality/reworkconfirmationnew';

const refuse = (e) => toast.error(e.message, { id: e.message, duration: 6000 });

export default function ReworkConfirmation() {
  const [options, setOptions] = useState(null);
  const [failed, setFailed] = useState(false);
  const [department, setDepartment] = useState('');
  const [params, setParams] = useSearchParams();
  const [opened, setOpened] = useState(''); // a serial picked from the list
  const listing = params.get('view') === 'list';

  useEffect(() => {
    reworkApi.options().then((o) => (setOptions(o), setDepartment(o.department))).catch((e) => (setFailed(true), refuse(e)));
  }, []);

  const source = useMemo(() => reworkApi.waiting(department), [department]);
  const open = (row) =>
    reworkApi.serialOf(row.c1)
      .then((r) => {
        setOpened(r.serial);
        setParams({});
      })
      .catch(refuse);

  return (
    <Page
      icon={RefreshCcw}
      title="Rework Confirmation"
      subtitle={listing ? 'Units waiting for rework; click one to open it' : 'Scan a unit sent to rework, then confirm the repair'}
      actions={
        listing ? (
          <Button size="sm" variant="outline" icon={ArrowLeft} onClick={() => setParams({})}>Back to form</Button>
        ) : (
          <Button size="sm" variant="outline" icon={ListIcon} onClick={() => setParams({ view: 'list' })}>Units waiting</Button>
        )
      }
    >
      {!options ? (
        failed ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />
      ) : listing ? (
        <RecordsList tableId={route} exportName="rework-confirmation" source={source} onOpen={open} />
      ) : (
        <ReworkForm options={options} department={department} onDepartment={setDepartment} opened={opened} />
      )}
    </Page>
  );
}
