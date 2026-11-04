// Process Guide (original View/Production/ProcessGuideForm.aspx): a station's work instructions and drawings for a job
// card, and who is logged in at which station. The login's rules are the original's, as they are: it logs out whoever is at
// the station, and this user anywhere, before it checks the password (docs/PARITY-REPORT.md).
import { query, scalar, execute } from '../../../db/pool.js';
import { dataTable } from '../../../db/tables.js';
import { AppError } from '../../../shared/AppError.js';
import { netString, netInt } from '../../../shared/net.js';
import { getPSNo, guideData, orderMaterial, validateWorkStation } from '../production.service.js';
import { settingText } from '../../settings/settings.service.js';

export const SCREEN = '/production/processguideform';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// DateTime.Now.ToString("dd-MMM-yyyy HH:mm:ss")
const nowStamp = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${[d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}`;

const choices = (rows) => rows.map((r) => ({ value: netString(r.v), label: netString(r.t) }));
const scanFindsStation = () => netInt(settingText('WorkStationScan', '1')) === 1;

export const logins = async () =>
  (await dataTable('Select w.Name[Station],u.UserName,pl.Login,pl.UserCode from ProcessUserLogin pl inner join WorkCenter w on pl.Station =w.StationCode inner join users u on pl.UserCode=u.UserCode where pl.Status =1'))
    .map((r) => ({ station: netString(r.Station), userName: netString(r.UserName), login: netString(r.Login), userCode: netString(r.UserCode) }));

const departments = async (bu) => choices(await query("Select DeptCode v, CONCAT(Name,' - ',Alias) t from Department where BusinessUnit=@bu and DeptType=6000", { bu }));

/** what the screen chooses from; the department is the session's (then fixed), or the only one there is */
export async function options(ctx) {
  const list = await departments(ctx.businessUnit);
  const own = netString(ctx.department);
  const [stations, users, me] = await Promise.all([
    query("Select StationCode v, CONCAT(Name, ' - ', Alias) t from WorkCenter where BusinessUnit=@bu", { bu: ctx.businessUnit }).then(choices),
    query('Select UserCode v, UserName t from Users order by UserName').then(choices),
    scalar('select UserName from Users where UserCode=@u', { u: ctx.userCode }),
  ]);
  return {
    departments: list,
    department: own !== '' && list.some((d) => d.value === own) ? own : list.length === 1 ? list[0].value : '',
    departmentFixed: own !== '',
    stations,
    users,
    user: netString(me),
    logins: await logins(),
  };
}

/** a station scanned: WorkStationScan 1 finds it in the business unit (and gives its department), otherwise in the chosen
 *  department. { station, alias, process, department } */
export async function station(code, department, ctx) {
  const ws = netString(code).trim();
  if (scanFindsStation()) {
    const r = await validateWorkStation(ws, ctx.businessUnit);
    if (!r.ok) throw AppError.badRequest('Invalid Work Center');
    const [stationCode, alias] = r.rtn.split('~');
    const dept = netString(await scalar('select Department from WorkCenter where StationCode=@s', { s: stationCode }));
    return { station: stationCode, alias, process: netString(r.process), department: dept };
  }
  const dept = netString(department);
  if (dept === '') throw AppError.badRequest('Select Departmet');
  const [row] = await query(`select StationCode, Alias from WorkCenter where ${/^\d+$/.test(ws) ? 'StationCode=@ws' : 'Alias=@ws'} and Department=@d and BusinessUnit=@bu`, { ws, d: dept, bu: ctx.businessUnit });
  if (!row) throw AppError.badRequest('Invalid Work Center');
  const process = await scalar('select ProcessCode from WorkCenterProcesses where StationCode=@s', { s: row.StationCode });
  return { station: netString(row.StationCode), alias: netString(row.Alias), process: netString(process), department: dept };
}

/** where a guide file opens, and how it is shown (pdf, dwg viewer, png; any other kind is not shown) */
export function guideFile(value) {
  const url = value.startsWith('~/') ? value.slice(1) : /^([a-z]+:|\/)/i.test(value) ? value : `/View/Production/${value}`; // Page.ResolveUrl
  const kind = value.toLowerCase().includes('.pdf') ? 'pdf' : value.includes('.dwg') ? 'dwg' : value.toLowerCase().includes('.png') ? 'png' : null;
  return { kind, url };
}

/** the job card at the scanned station; the process is found again from the station, never taken from the browser */
export async function guide(serial, stationCode, department, ctx) {
  const ps = await getPSNo(netString(serial).trim());
  if (ps === '') throw AppError.badRequest('Invalid Barcode');
  const { process } = await station(stationCode, department, ctx);
  const g = await guideData(ps, process);
  return {
    instructions: g.instructions.map((r) => netString(r.Instruction)),
    files: g.files.filter((f) => f.value !== '').map((f) => ({ label: f.text, ...guideFile(f.value) })),
    materials: (await orderMaterial(ps)).map((r) => ({ model: netString(r.Model), material: netString(r.Material) })),
  };
}

const logOutWhere = async (column, value) => {
  const open = netString(await scalar(`Select top 1 UserCode from ProcessUserLogin where Status=1 and ${column}=@v`, { v: value }));
  if (netInt(open) > 0) await logOut(open);
};
export const logOut = (userCode) => execute('Update ProcessUserLogin set Status=2, Logout=@now where UserCode=@u', { now: nowStamp(), u: userCode });

/** { station, user, password, qr }: a QR holds user|password and wins over the two boxes */
export async function logIn(body) {
  let [user, password] = [body.user, body.password];
  const qr = body.qr.split('|');
  if (qr.length > 1) [user, password] = [qr[0], qr[1]];
  if (body.station === '') throw AppError.badRequest('Select a Station');
  if (user === '') throw AppError.badRequest('Select a user');
  if (!/^\d+$/.test(user)) throw AppError.badRequest('Select a user from the list');
  await logOutWhere('Station', body.station);
  await logOutWhere('UserCode', user);
  if (netString(await scalar('Select Password from Users where userCode=@u', { u: user })) !== password) throw AppError.badRequest('Wrong Password');
  await execute('Insert into ProcessUserLogin(Station,UserCode,Login,Status) values(@s,@u,@now,1)', { s: body.station, u: user, now: nowStamp() });
  return { logins: await logins() };
}
