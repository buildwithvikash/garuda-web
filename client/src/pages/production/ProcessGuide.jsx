// Process Guide (sidebar: Production › Process Guide): a station's instructions and drawings for a job card, and who is
// logged in at which station. Server: /api/production/process-guides.
import { useEffect, useState } from 'react';
import { BookOpen, LogIn, LogOut, RotateCw, ScanLine, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { GuideView } from '@/components/shared/FormControls.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { Step } from '@/components/shared/FormStep.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import { Button } from '@/components/ui/button.jsx';

export const route = '/production/processguideform';

const BASE = '/production/process-guides';
const enc = encodeURIComponent;
const refuse = (e) => toast.error(e.message, { id: e.message, duration: 6000 });

const TH = 'px-3 py-2 font-medium';
const TD = 'px-3 py-2';
function Table({ headers, rows, empty }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>{headers.map((h, i) => <th key={i} scope="col" className={TH}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-muted-foreground">{empty}</td></tr>}
          {rows}
        </tbody>
      </table>
    </div>
  );
}

function Guide({ options }) {
  const [department, setDepartment] = useState(options.department);
  const [stationBox, setStationBox] = useState('');
  const [station, setStation] = useState(''); // the station found by the last scan
  const [order, setOrder] = useState('');
  const [guide, setGuide] = useState(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = async (step) => {
    setBusy(true);
    try {
      await step();
    } finally {
      setBusy(false);
    }
  };

  const scanStation = () =>
    run(async () => {
      setStation('');
      try {
        const r = await api(`${BASE}/stations/${enc(stationBox.trim())}?department=${enc(department)}`);
        setStation(r.station);
        setStationBox(r.alias);
        setDepartment(r.department);
      } catch (e) {
        refuse(e);
        setStationBox('');
      }
    });
  const scanOrder = () =>
    run(async () => {
      try {
        setGuide(await api(`${BASE}/guide?serial=${enc(order.trim())}&station=${enc(station)}&department=${enc(department)}`));
        setOpen(true);
        setFile(0);
      } catch (e) {
        refuse(e);
        setOrder('');
      }
    });
  const clearOrder = () => (setOrder(''), setGuide(null), setOpen(false));

  const shown = guide?.files[file];
  return (
    <>
      <Step n={1} tone="blue" icon={ScanLine} title="Station and order" subtitle="Scan the station, then the order">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="User" value={options.user} disabled />
          <Select label="Department" value={department} options={options.departments} disabled={options.departmentFixed} onChange={(v) => setDepartment(v ?? '')} />
          {!guide && (
            <div className="grid min-w-0 gap-2">
              <span className="text-sm leading-none font-medium">Station Machine</span>
              <ScanBox size="md" label="Station Machine" placeholder="Scan the station" value={stationBox} onChange={setStationBox} onScan={scanStation} busy={busy} />
            </div>
          )}
          <div className="grid min-w-0 gap-2">
            <span className="text-sm leading-none font-medium">Order</span>
            <ScanBox size="md" label="Order" placeholder="Scan the order" value={order} onChange={setOrder} locked={!!guide} onScan={scanOrder} onClear={clearOrder} busy={busy} />
          </div>
        </div>
        {guide && (
          <div className="mt-4">
            <Table headers={['Model', 'Material']} empty="No material on this order." rows={guide.materials.map((m, i) => <tr key={i}><td className={TD}>{m.model}</td><td className={TD}>{m.material}</td></tr>)} />
          </div>
        )}
      </Step>
      {open && (
        <Step n={2} tone="emerald" icon={BookOpen} title="Guide" subtitle="This station's instructions and drawings" actions={<Button size="sm" variant="outline" icon={X} onClick={() => setOpen(false)}>Close</Button>}>
          <div className="space-y-4">
            {guide.files.length > 0 && (
              <Select className="max-w-xl" label="Guide Panel" value={String(file)} options={guide.files.map((f, i) => ({ value: String(i), label: f.label }))} onChange={(v) => setFile(v === null ? -1 : Number(v))} />
            )}
            {shown?.kind && <GuideView g={shown} />}
            {guide.instructions.length > 0 && (
              <Table headers={['Instruction']} rows={guide.instructions.map((t, i) => <tr key={i}><td className={TD}>{t}</td></tr>)} />
            )}
          </div>
        </Step>
      )}
    </>
  );
}

function Logins({ options }) {
  const [stationBox, setStationBox] = useState('');
  const [stationLocked, setStationLocked] = useState(false);
  const [login, setLogin] = useState({ station: '', user: '', password: '', qr: '' });
  const [rows, setRows] = useState(options.logins);
  const [busy, setBusy] = useState(false);
  const set = (field) => (v) => setLogin((x) => ({ ...x, [field]: v ?? '' }));

  const scanStation = () => {
    const want = stationBox.trim();
    if (!options.stations.some((s) => s.value === want)) {
      refuse(new Error('Invalid Station'));
      return setStationBox('');
    }
    setLogin((x) => ({ ...x, station: want, qr: '' }));
    return setStationLocked(true);
  };
  const clearStation = () => (setStationBox(''), setStationLocked(false), set('station')(''));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api(`${BASE}/logins`, { method: 'POST', body: login });
      setRows(r.logins);
      toast.success('Done');
      setLogin((x) => ({ ...x, station: '', password: '', qr: '' }));
    } catch (err) {
      refuse(err);
      if (err.message !== 'Wrong Password') set('qr')('');
    } finally {
      setBusy(false);
    }
  };
  const logOut = async (userCode) => {
    setBusy(true);
    try {
      setRows(await api(`${BASE}/logins/${enc(userCode)}`, { method: 'DELETE' }));
    } catch (err) {
      refuse(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Step n={3} tone="violet" icon={Users} title="Station logins" subtitle="Who is logged in at which station">
      <form onSubmit={submit} className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4" autoComplete="off">
        <div className="grid min-w-0 gap-2">
          <span className="text-sm leading-none font-medium">Station Machine</span>
          <ScanBox size="md" label="Station Machine" placeholder="Scan the station" value={stationBox} onChange={setStationBox} locked={stationLocked} onScan={scanStation} onClear={clearStation} />
        </div>
        <Select label="Station" value={login.station} options={options.stations} onChange={set('station')} />
        <Select label="User" value={login.user} options={options.users} onChange={set('user')} />
        <TextInput label="Password" type="password" autoComplete="new-password" value={login.password} onChange={(e) => set('password')(e.target.value)} />
        <TextInput label="Scan QRCode" type="password" autoComplete="off" value={login.qr} onChange={(e) => set('qr')(e.target.value)} />
        <div className="self-end"><Button type="submit" icon={LogIn} loading={busy}>Login</Button></div>
      </form>
      <div className="mt-4">
        <Table
          headers={['', 'Station', 'UserName', 'Login', 'UserCode']}
          empty="Nobody is logged in."
          rows={rows.map((r) => (
            <tr key={r.userCode}>
              <td className={TD}><Button size="sm" variant="outline" icon={LogOut} disabled={busy} onClick={() => logOut(r.userCode)}>Logout</Button></td>
              <td className={TD}>{r.station}</td>
              <td className={TD}>{r.userName}</td>
              <td className={TD}>{r.login}</td>
              <td className={TD}>{r.userCode}</td>
            </tr>
          ))}
        />
      </div>
    </Step>
  );
}

export default function ProcessGuide() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api(`${BASE}/options`).then(setOptions).catch((e) => (setError(true), refuse(e)));
  }, []);
  return (
    <Page icon={BookOpen} title="Process Guide" subtitle="Scan a station and an order to see the guide">
      {options ? (
        <div className="space-y-2">
          <Guide options={options} />
          <Logins options={options} />
        </div>
      ) : error ? (
        <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button>
      ) : (
        <Loader />
      )}
    </Page>
  );
}
