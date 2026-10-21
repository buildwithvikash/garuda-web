// Write parity for page code that writes outside the engine's Save (UAT, everything put back afterwards):
//  - RoutingUpdate "Go" (AVProductionCapture.UpdateJobRouting) on a job card: its ProcessRouting rows are saved first,
//    the original runs, the rows are read and restored, the new app runs, read and restored again; compared.
//  - ChangePassword / ResetPassword save handlers on a temporary user (UserID ZZPTEST…), each case from the same
//    starting row; the user row afterwards, the alerts, TitleControl's result and the sign-out are compared.
// Usage: node --env-file=.env scripts/parity/page-writes-parity.mjs <originalBinDir> [jobCard]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { newFormState, displayState } from '../../src/modules/forms/state.js';
import { PAGE_EVENTS, PAGE_SAVE, PAGE_UPDATE, PAGE_LOAD, PAGE_POSTBACK, eventHelpers } from '../../src/modules/forms/pages.js';
import { toText } from '../../src/modules/forms/values.js';
import { collect, insert, update } from '../../src/modules/forms/write.js';

const [bin, jobArg] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
await loadSettings();
const specOf = (spec) => ({ top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits });

function original(cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 512 * 1024 * 1024,
  }).toString();
  return JSON.parse(raw.slice(raw.indexOf('[')));
}
const rowsText = (rows) => rows.map((r) => JSON.stringify(Object.entries(r).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)]))).sort();
const results = [];

// ---- RoutingUpdate Go -------------------------------------------------------------------------------------------
{
  const spec = SPECS['/settings/routingupdateform'];
  const jc = jobArg ?? String((await query('select top 1 r.PSNo from ProcessRouting r join ProcessOrder p on p.PSNO = r.PSNo where p.Status = 1 and r.Status = 0 order by r.PSNo desc'))[0]?.PSNo ?? '');
  const saved = await query('select * from ProcessRouting where PSNo = @j', { j: jc });
  const cols = Object.keys(saved[0] ?? {});
  const restore = async () => {
    await execute('delete from ProcessRouting where PSNo = @j', { j: jc });
    for (const r of saved) await execute(`insert into ProcessRouting(${cols.join(',')}) values (${cols.map((_, i) => `@p${i}`).join(',')})`, Object.fromEntries(cols.map((c, i) => [`p${i}`, r[c]])));
  };
  try {
    const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps: [{ handler: 'Go_Click', control: 'Go', values: { DDLJobCard: jc } }], ctx: { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' }, spec: specOf(spec) }]);
    const afterO = rowsText(await query('select * from ProcessRouting where PSNo = @j', { j: jc }));
    await restore();
    const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
    const v = { ...Object.fromEntries((await newFormState(spec, ctx)).controls.filter((c) => c.id).map((c) => [c.id, c.value ?? ''])), DDLJobCard: jc };
    const n = await PAGE_EVENTS[spec.file].Go(v, eventHelpers(spec, ctx, v)).catch((e) => ({ error: e.message }));
    const afterN = rowsText(await query('select * from ProcessRouting where PSNo = @j', { j: jc }));
    await restore();
    const oa = (o.result?.alerts ?? []).join('|');
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    if (n.error) problems.push(`new ERROR ${n.error}`);
    if (JSON.stringify(afterO) !== JSON.stringify(afterN)) problems.push(`rows ${afterO.length} vs ${afterN.length}: ${JSON.stringify(afterO).slice(0, 200)} vs ${JSON.stringify(afterN).slice(0, 200)}`);
    if (oa !== (n.alert ?? '')) problems.push(`alert "${oa}" vs "${n.alert ?? ''}"`);
    results.push([`RoutingUpdate Go (job card ${jc}, ${saved.length} rows)`, problems.length ? problems.join(' | ') : `IDENTICAL (${oa ? `alert "${oa}"` : 'routing rebuilt'}; rows ${saved.length} -> ${afterO.length})`]);
  } finally {
    await restore();
  }
}

// ---- ChangePassword / ResetPassword -----------------------------------------------------------------------------
{
  const code = 99999901; // temporary user (UserID = the code as text, so ResetPassword's UserID lookup finds it)
  const uid = String(code);
  const start = async (pw) => {
    await execute('delete from Users where UserCode = @c', { c: code });
    await execute("insert into Users(UserCode, UserID, UserName, Password, WrongPw, Status, SystemUser, Locked) values (@c, @u, 'ZZPTEST', @p, 0, 1, 0, 0)", { c: code, u: uid, p: pw });
  };
  const userRow = async () => rowsText((await query('select UserID, Password, WrongPw, Locked, case when LastPwChOn is null then 0 else 1 end PwChanged from Users where UserCode = @c', { c: code })));
  const ctx = { businessUnit: '12201', department: '1230001', userCode: uid, userId: uid };
  const OLD = 'Old@12345';
  const cases = [
    ['/authorization/changepasswordform', { TBUser: uid, TBCurPass: OLD, TBNewPass: 'New@12345', TBRetypePass: 'New@12345' }],
    ['/authorization/changepasswordform', { TBUser: uid, TBCurPass: 'wrong', TBNewPass: 'New@12345', TBRetypePass: 'New@12345' }],
    ['/authorization/changepasswordform', { TBUser: uid, TBCurPass: OLD, TBNewPass: 'weak', TBRetypePass: 'weak' }],
    ['/authorization/changepasswordform', { TBUser: uid, TBCurPass: OLD, TBNewPass: 'New@12345', TBRetypePass: 'Other@123' }],
    ['/authorization/changepasswordform', { TBUser: uid, TBCurPass: '', TBNewPass: 'New@12345', TBRetypePass: 'New@12345' }],
    ['/authorization/resetpasswordform', { DDLUser: uid, TBNewPass: 'New@12345', TBRetypePass: 'New@12345' }],
    ['/authorization/resetpasswordform', { DDLUser: uid, TBNewPass: 'weak', TBRetypePass: 'weak' }],
    ['/authorization/resetpasswordform', { DDLUser: uid, TBNewPass: 'New@12345', TBRetypePass: 'Other@123' }],
    ['/authorization/resetpasswordform', { DDLUser: uid, TBNewPass: ' ', TBRetypePass: ' ' }],
    ['/authorization/resetpasswordform', { DDLUser: '', TBNewPass: 'New@12345', TBRetypePass: 'New@12345' }],
  ];
  try {
    for (const [route, values] of cases) {
      const spec = SPECS[route];
      await start(OLD);
      const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps: [{ handler: 'BTNSave_Click', control: 'BtnSave', values }], ctx, spec: specOf(spec) }]);
      const afterO = await userRow();
      await start(OLD);
      const state = await newFormState(spec, ctx);
      const v = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.value ?? ''])), ...values };
      if (v.DDLUser !== undefined && !state.controls.find((c) => c.id === 'DDLUser').options.some((x) => x.value === v.DDLUser)) v.DDLUser = '';
      const n = await PAGE_SAVE[spec.file](v, eventHelpers(spec, ctx, v)).catch((e) => ({ error: e.message }));
      const afterN = await userRow();
      const label = `${route.split('/')[2]} ${JSON.stringify(values).slice(0, 90)}`;
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      if (n.error) problems.push(`new ERROR ${n.error}`);
      if (JSON.stringify(afterO) !== JSON.stringify(afterN)) problems.push(`user row ${JSON.stringify(afterO)} vs ${JSON.stringify(afterN)}`);
      if (o.ok) {
        // Response.Redirect("~/View/LoginForm.aspx") cannot resolve "~" outside a web host: the page has just cleared
        // the session user, then fails there - that is the sign-out redirect
        const redirected = !!o.result.redirect || (o.result.sessionUser === '' && /^Object reference/.test(o.result.title?.message ?? ''));
        const oAlert = (o.result.alerts ?? []).filter((a) => !(redirected && /^Object reference/.test(a))).join('|');
        const oLogout = redirected;
        const oTitle = o.result.title ?? {};
        // TitleControl shows Message as the error when Success is false
        const nOk = n.ok !== false;
        if (oAlert !== (n.alert ?? '')) problems.push(`alert "${oAlert}" vs "${n.alert ?? ''}"`);
        if (oLogout !== !!n.logout) problems.push(`signed out ${oLogout} vs ${!!n.logout}`);
        if (!oLogout && (!!oTitle.success !== nOk || (!nOk && oTitle.message !== n.message))) problems.push(`TitleControl ${JSON.stringify(oTitle)} vs ok=${nOk} "${n.message}"`);
      }
      results.push([label, problems.length ? problems.join(' | ') : 'IDENTICAL']);
    }
  } finally {
    await execute('delete from Users where UserCode = @c', { c: code });
    await execute('delete from EventLog where EventUser = @c', { c: code }).catch(() => {});
  }
}

// ---- SerialGenerationLogic update (BTNUpdate_Click) ---------------------------------------------------------------
// A logic with a serial part (VariantCode 10) used by materials with this year's SerialBarcode rows: the header,
// detail rows and those SerialBarcode rows are saved, each case runs on the original then the new app (restored in
// between and after), and the rows afterwards plus TitleControl's result are compared.
{
  const spec = SPECS['/materialsetup/serialgenerationlogicform'];
  const yy = Number(String(new Date().getFullYear()).slice(-2));
  const key = String((await query(`select top 1 h.SerialCode from SerialGenerationLogicHeader h where exists (select 1 from SerialGenerationLogicDetail d where d.SerialCode=h.SerialCode and d.VariantCode=10)
    order by (select count(*) from SerialBarcode b join Material m on m.MatCode=b.Material where m.AssetTagType=h.SerialCode and b.AssetId=1 and b.Year=@y) desc`, { y: yy }))[0]?.SerialCode ?? '');
  const bu = String((await query('select top 1 b.BusinessUnit from SerialBarcode b join Material m on m.MatCode=b.Material where m.AssetTagType=@k and b.AssetId=1 and b.Year=@y', { k: key, y: yy }))[0]?.BusinessUnit ?? '12201');
  const ctx = { businessUnit: bu, department: '1230001', userCode: '123003', userId: '123003' };
  const head = (await query('select * from SerialGenerationLogicHeader where SerialCode=@k', { k: key }))[0];
  const det = await query('select * from SerialGenerationLogicDetail where SerialCode=@k', { k: key });
  const sbSql = 'select b.ID, b.NextSerialNo from SerialBarcode b join Material m on m.MatCode=b.Material where m.AssetTagType=@k';
  const sb = await query(sbSql, { k: key });
  const restore = async () => {
    const hc = Object.keys(head).filter((c) => c !== 'SerialCode');
    await execute(`update SerialGenerationLogicHeader set ${hc.map((c, i) => `[${c}]=@p${i}`).join(',')} where SerialCode=@k`, { k: key, ...Object.fromEntries(hc.map((c, i) => [`p${i}`, head[c]])) });
    await execute('delete from SerialGenerationLogicDetail where SerialCode=@k', { k: key });
    const dc = Object.keys(det[0] ?? {});
    for (const r of det) await execute(`insert into SerialGenerationLogicDetail(${dc.map((c) => `[${c}]`).join(',')}) values (${dc.map((_, i) => `@p${i}`).join(',')})`, Object.fromEntries(dc.map((c, i) => [`p${i}`, r[c]])));
    for (const r of sb) await execute('update SerialBarcode set NextSerialNo=@n where ID=@id', { n: r.NextSerialNo, id: r.ID });
  };
  const snapshot = async () => ({
    head: rowsText(await query('select * from SerialGenerationLogicHeader where SerialCode=@k', { k: key })),
    det: rowsText(await query('select * from SerialGenerationLogicDetail where SerialCode=@k', { k: key })),
    sb: rowsText(await query(sbSql, { k: key })),
  });
  const shown = await displayState(spec, ctx, key);
  const rows0 = shown.controls.find((c) => c.id === 'GVTransData').rows;
  const serialRow = rows0.findIndex((r) => String(r.VariantCode) === '10');
  const cases = [
    ['serial start changed', { TextBox3: 'ZZP serial' }, rows0.map((r, i) => (i === serialRow ? { ...r, StartingNo: String(Number(r.StartingNo) + 7) } : r))],
    ['serial start unchanged', { TextBox3: 'ZZP same' }, rows0],
  ];
  try {
    for (const [name, values, rows] of cases) {
      await restore();
      const [o] = original([{ id: 0, mode: 'event', key, viewState: {}, gridRows: { GVTransData: rows }, steps: [{ handler: 'BTNUpdate_Click', control: 'TitleControl', values }], ctx, spec: specOf(spec) }]);
      const afterO = await snapshot();
      await restore();
      const state = await displayState(spec, ctx, key);
      const raw = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')])), ...values, GVTransData: rows };
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, Array.isArray(x) ? x : String(x ?? '')]));
      const n = await PAGE_UPDATE[spec.file](v, { ...eventHelpers(spec, ctx, raw, { viewState: state.viewState }), raw }).catch((e) => ({ error: e.message }));
      const afterN = await snapshot();
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      if (n.error) problems.push(`new ERROR ${n.error}`);
      for (const k of ['head', 'det', 'sb']) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k]).slice(0, 300)} vs ${JSON.stringify(afterN[k]).slice(0, 300)}`);
      const t = o.result?.title ?? {};
      if (o.ok && (!!t.success !== (n.ok !== false) || (!t.success && t.message !== n.message))) problems.push(`TitleControl ${JSON.stringify(t)} vs ok=${n.ok} "${n.message}"`);
      const moved = JSON.stringify(afterN.sb) !== JSON.stringify(rowsText(sb));
      results.push([`SerialGenerationLogic update #${key} (${name}, ${sb.length} serial rows)`, problems.length ? problems.join(' | ') : `IDENTICAL (serial rows ${moved ? 'reset' : 'untouched'})`]);
    }
  } finally {
    await restore();
  }
}

// ---- CompanyForm update (the single Company row; engine Update, no Add / Delete on this page) --------------------
{
  const spec = SPECS['/businesssetup/companyform'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const saved = (await query('select * from Company'))[0];
  const key = String(saved.Code);
  const cols = Object.keys(saved).filter((c) => c !== 'Code');
  const restore = () => execute(`update Company set ${cols.map((c, i) => `[${c}]=@p${i}`).join(',')} where Code=@k`, { k: saved.Code, ...Object.fromEntries(cols.map((c, i) => [`p${i}`, saved[c]])) });
  const row = async () => rowsText(await query('select Code, CompanyName, LicenceType, ExpiryBy, UniqueID, LicenceID, datalength(Logo) logo from Company'));
  const values = { TextBox2: 'ZZP Company', TextBox13: 'ZZP-LIC', TextBox4: 'ZZP-UID', TextBox1: '2027-03-31' };
  try {
    const o = original([{ id: 0, mode: 'update', key, spec: specOf(spec), ctx, values }])[0];
    const afterO = await row();
    await restore();
    const state = await displayState(spec, ctx, key);
    const v = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.value ?? ''])), ...values };
    const n = await update(spec, await collect(spec, v, ctx), ctx).then((k) => ({ key: k }), (e) => ({ error: e.message }));
    const afterN = await row();
    const problems = [];
    if (!o.ok || n.error) { if (o.error !== n.error) problems.push(`original ${o.ok ? 'ok' : `ERROR ${o.error}`} / new ${n.error ? `ERROR ${n.error}` : 'ok'}`); }
    if (JSON.stringify(afterO) !== JSON.stringify(afterN)) problems.push(`row ${JSON.stringify(afterO)} vs ${JSON.stringify(afterN)}`);
    results.push([`Company update #${key}`, problems.length ? problems.join(' | ') : `IDENTICAL (${o.ok ? 'updated' : `both fail: ${o.error}`})`]);
  } finally {
    await restore();
  }
}

// ---- Save after a Page_Load that runs on every postback --------------------------------------------------------------
// The original: the user's values, the page's Page_Load as on the Save postback, then Avctions.Save. The new app:
// PAGE_POSTBACK on the posted values, then the engine insert. The saved rows are compared, then both deleted.
{
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const CASES = [
    ['/production/monthlyplanningform', { TBPlanYear: '2025', DDLMonth: '3', TBPlanQty: '50', DropDownList8: '1230002', ddlStatus: '1' }],
  ];
  for (const [route, values] of CASES) {
    const spec = SPECS[route];
    const table = spec.top.tag.replace('|*', '').split('|')[0];
    const pk = spec.view.tag.split('|')[1];
    const rowOf = async (k) => rowsText(await query(`select * from ${table} where ${pk}=@k`, { k })).map((x) => x.split(`"${k}"`).join('"KEY"'));
    const keys = [];
    try {
      const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps: [{ handler: 'Page_Load', control: 'TitleControl', values }, { handler: '__save', control: '', values: {} }], ctx, spec: specOf(spec) }]);
      const keyO = o.ok ? o.result.savedKey : '';
      if (keyO) keys.push(keyO);
      const state = await newFormState(spec, ctx);
      PAGE_LOAD[spec.file]?.(state.controls, ctx);
      const v0 = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.value ?? ''])), ...values };
      const v = PAGE_POSTBACK[spec.file] ? await PAGE_POSTBACK[spec.file](v0, spec, ctx) : v0;
      const n = await insert(spec, await collect(spec, v, ctx), ctx).then((k) => ({ key: k }), (e) => ({ error: e.message }));
      if (n.key) keys.push(n.key);
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      if (n.error) problems.push(`new ERROR ${n.error}`);
      const ro = keyO ? await rowOf(keyO) : [];
      const rn = n.key ? await rowOf(n.key) : [];
      if (JSON.stringify(ro) !== JSON.stringify(rn)) problems.push(`row ${JSON.stringify(ro)} vs ${JSON.stringify(rn)}`);
      results.push([`${route} save after Page_Load`, problems.length ? problems.join(' | ') : `IDENTICAL ${JSON.stringify(ro).slice(0, 160)}`]);
    } finally {
      for (const k of keys) await execute(`delete from ${table} where ${pk}=@k`, { k });
    }
  }
}

// ---- ProcessOrderPlan Group / Delete / Save ------------------------------------------------------------------------
// The calendar and routing rows of every job card of the production order are saved, each case runs on the original
// then the new app (restored in between and after), and the rows, alerts and TitleControl result are compared.
{
  const spec = SPECS['/production/processorderplanform'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const prods = (await query(`select top 3 po.PRODNo from ProcessOrder po join RoutingTrans rt on rt.RouteCode=po.Routing and rt.StationScan=1
    where exists (select 1 from WorkCenterCalander w where w.PSNo=po.PSNo) group by po.PRODNo order by po.PRODNo desc`)).map((r) => String(r.PRODNo));
  for (const prod of prods) {
    const jobs = (await query('select PSNo from ProcessOrder where PRODNo=@p order by PSNo', { p: prod })).map((r) => String(r.PSNo));
    const inJobs = `PSNo in (${jobs.join(',')})`;
    const cal = await query(`select * from WorkCenterCalander where ${inJobs}`);
    const route = await query(`select PSNo, ProcessCode, SeqNo, StationCode from ProcessRouting where ${inJobs}`);
    const restore = async () => {
      await execute(`delete from WorkCenterCalander where ${inJobs}`);
      const cols = Object.keys(cal[0] ?? {});
      for (const r of cal) await execute(`set identity_insert WorkCenterCalander on; insert into WorkCenterCalander(${cols.join(',')}) values (${cols.map((_, i) => `@p${i}`).join(',')}); set identity_insert WorkCenterCalander off`, Object.fromEntries(cols.map((c, i) => [`p${i}`, r[c]])));
      for (const r of route) await execute('update ProcessRouting set StationCode=@s where PSNo=@p and ProcessCode=@c and SeqNo=@q', { s: r.StationCode, p: r.PSNo, c: r.ProcessCode, q: r.SeqNo });
    };
    const snap = async () => ({ cal: rowsText(await query(`select PSNo,StationCode,ProcessCode,ScheduledStartOn,ScheduledCompeleteOn,ActualStartOn,ActualCompletedOn,Status from WorkCenterCalander where ${inJobs}`)), route: rowsText(await query(`select PSNo,ProcessCode,StationCode from ProcessRouting where ${inJobs}`)) });
    const job = jobs.at(-1);
    const CASES = [['Group', 'BtnGroup_Click', 'BtnGroup'], ['Delete', 'BtnDelete_Click1', 'BtnDelete'], ['Save', 'BTNSave_Click', null]];
    try {
      for (const [name, handler, control] of CASES) {
        await restore();
        const steps = [{ handler: 'DDLCustomer_SelectedIndexChanged', control: 'DDLCustomer', values: { DDLCustomer: prod } }, { handler, control: control ?? 'TitleControl', values: { PrimaryKey: job } }];
        // GVTransData_DataBound keeps the grid's table as ViewState['TransData'] (grid events are not wired in the harness)
        const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, gridViewState: { GVRoute: 'TransData' }, steps, ctx, spec: specOf(spec) }]);
        const afterO = await snap();
        await restore();
        const state = await newFormState(spec, ctx);
        const v = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')])), DDLCustomer: prod, PrimaryKey: job };
        const h = { ...eventHelpers(spec, ctx, v), raw: v };
        const n = await (control ? PAGE_EVENTS[spec.file][control](v, h) : PAGE_SAVE[spec.file](v, h)).catch((e) => ({ error: e.message }));
        const afterN = await snap();
        const problems = [];
        if (!o.ok) problems.push(`original ERROR ${o.error}`);
        if (n.error) problems.push(`new ERROR ${n.error}`);
        for (const k of ['cal', 'route']) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} differs (${afterO[k].length} vs ${afterN[k].length} rows)`);
        const oa = (o.result?.alerts ?? []).join('|');
        if (oa !== (n.alert ?? '')) problems.push(`alert "${oa}" vs "${n.alert ?? ''}"`);
        if (!control && o.ok && !!o.result.title?.success !== (n.ok !== false)) problems.push(`TitleControl ${JSON.stringify(o.result.title)} vs ok=${n.ok}`);
        results.push([`ProcessOrderPlan ${name} (prod ${prod}, ${jobs.length} job cards)`, problems.length ? problems.join(' | ') : `IDENTICAL${oa ? ` (alert "${oa}")` : n.success ? ' (success)' : ''}`]);
      }
    } finally {
      await restore();
    }
  }
}

// ---- AreaCleaning save with the QC checklist -----------------------------------------------------------------------
// The original: area chosen, checklist popup filled and closed, then BTNSave_Click; the new app the same through its
// events and PAGE_SAVE. Both saved records (header + checklist rows, keys normalised) are compared, then deleted.
// (needs checklist items on area 1240001: qcdata-tmp.mjs add)
{
  const spec = SPECS['/quality/areacleaningform'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const head = { TBCleanedBy: 'ZZP cleaner', TextBox1: 'ZZP remark' };
  const qcSteps = [['btnSave_Click', 'save', { TBValue: 'Ravi', TBRemark: 'ok' }], ['btnSave_Click', 'save', { TBValue: '2' }], ['btnSave_Click', 'save', { TBRemark: 'clean' }], ['IMBClose_Click', 'close', {}]];
  const keys = [];
  try {
    const steps = [{ handler: 'Page_Load', control: 'TitleControl', values: {} }, { handler: 'DDLArea_SelectedIndexChanged', control: 'DDLArea', values: { DDLArea: '1240001' } }, { handler: 'BtnUD_Click', control: 'BtnUD', values: {} },
      ...qcSteps.map(([handler, , qc]) => ({ target: 'QC', handler, qc, control: 'QC', values: {} })), { handler: 'BTNSave_Click', control: 'TitleControl', values: head }];
    const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx, spec: specOf(spec) }]);
    const keyO = String((await query("select top 1 ID from AreaCleaning where CleanedBy='ZZP cleaner' order by ID desc"))[0]?.ID ?? '');
    if (keyO) keys.push(keyO);
    const state = await newFormState(spec, ctx);
    let v = Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
    let vs = { ...state.viewState };
    const ev = async (name, patch = {}) => {
      Object.assign(v, patch);
      const r = await PAGE_EVENTS[spec.file][name](v, eventHelpers(spec, ctx, v, { viewState: vs }));
      for (const [k, p] of Object.entries(r.set ?? {})) if ('value' in p) v[k] = p.value;
      if (r.viewState) vs = r.viewState;
      return r;
    };
    await ev('DDLArea', { DDLArea: '1240001' });
    await ev('BtnUD');
    for (const [, name, qc] of qcSteps) {
      const st = structuredClone(v.QC);
      if (qc.TBValue !== undefined) st.f.TBValue.text = qc.TBValue;
      if (qc.TBRemark !== undefined) st.f.TBRemark = qc.TBRemark;
      await ev(`QC:${name}`, { QC: st });
    }
    Object.assign(v, head);
    const n = await PAGE_SAVE[spec.file](v, { ...eventHelpers(spec, ctx, v, { viewState: vs }), raw: v });
    if (n.key) keys.push(String(n.key));
    const rowsOf = async (k) => ({ head: rowsText((await query('select * from AreaCleaning where ID=@k', { k })).map(({ ID, ...r }) => r)), lines: rowsText(await query('select LineCode, LineValue, Remark, Status, InstrumentID from AreaCleaningCheckList where ID=@k', { k })) });
    const ro = keyO ? await rowsOf(keyO) : null;
    const rn = n.key ? await rowsOf(n.key) : null;
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    const t = o.result?.title ?? {};
    if (o.ok && (!!t.success !== (n.ok !== false) || (!t.success && t.message !== n.message))) problems.push(`TitleControl ${JSON.stringify(t)} vs ok=${n.ok} "${n.message}"`);
    if (JSON.stringify(ro) !== JSON.stringify(rn)) problems.push(`rows ${JSON.stringify(ro)} vs ${JSON.stringify(rn)}`);
    results.push(['AreaCleaning save with checklist', problems.length ? problems.join(' | ') : `IDENTICAL (${rn?.lines.length ?? 0} checklist rows)`]);
  } finally {
    for (const k of keys) {
      await execute('delete from AreaCleaningCheckList where ID=@k', { k });
      await execute('delete from AreaCleaning where ID=@k', { k });
    }
  }
}

// ---- Final Inspection save (QualityInspectionForm) ------------------------------------------------------------------
// A held barcode is scanned, approved and saved on the original, then (after restoring) on the new app. The lot's
// header, barcodes and their stock rows are saved before and restored after; the new inspection rows are compared
// (keys and times normalised) and deleted.
{
  const spec = SPECS['/quality/qualityinspectionform'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const pick = (cond) => query(`select top 1 mb.Serial, mb.InspectionLotNo from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=11 and ih.InspectionType=0 ${cond}
    and not exists (select 1 from InspectionTrans it where it.InspectionLotNo=mb.InspectionLotNo and it.SampleBarcode=mb.BarcodeNo) order by mb.BarcodeNo desc`);
  const cases = [['small barcode no', (await pick('and mb.BarcodeNo < 2147483647'))[0]], ['large barcode no', (await pick('and mb.BarcodeNo > 2147483647'))[0]]].filter(([, c]) => c);
  for (const [name, c] of cases) {
    const lot = String(c.InspectionLotNo);
    const head = (await query('select * from InspectionHeader where InspectionLotNo=@l', { l: lot }))[0];
    const bars = await query('select BarcodeNo, UDID, QCStatus, StorageCode from MaterialBarcode where InspectionLotNo=@l', { l: lot });
    const stockKey = "exists (select 1 from MaterialBarcode b where b.InspectionLotNo=@l and b.Material=s.Material and b.StorageCode=s.StorageCode and b.Batch=s.Batch)";
    const stock = await query(`select * from MaterialStock s where ${stockKey}`, { l: lot });
    const before = new Set((await query('select ID from InspectionTrans where InspectionLotNo=@l', { l: lot })).map((r) => String(r.ID)));
    const restore = async () => {
      const hc = Object.keys(head).filter((k) => k !== 'InspectionLotNo');
      await execute(`update InspectionHeader set ${hc.map((k, i) => `[${k}]=@p${i}`).join(',')} where InspectionLotNo=@l`, { l: lot, ...Object.fromEntries(hc.map((k, i) => [`p${i}`, head[k]])) });
      for (const b of bars) await execute('update MaterialBarcode set UDID=@u, QCStatus=@q, StorageCode=@s where BarcodeNo=@b', { u: b.UDID, q: b.QCStatus, s: b.StorageCode, b: b.BarcodeNo });
      await execute(`delete s from MaterialStock s where ${stockKey}`, { l: lot });
      const sc = Object.keys(stock[0] ?? {});
      for (const r of stock) await execute(`set identity_insert MaterialStock on; insert into MaterialStock(${sc.join(',')}) values (${sc.map((_, i) => `@p${i}`).join(',')}); set identity_insert MaterialStock off`, Object.fromEntries(sc.map((k, i) => [`p${i}`, r[k]])));
      for (const r of await query('select ID from InspectionTrans where InspectionLotNo=@l', { l: lot })) {
        if (before.has(String(r.ID))) continue;
        for (const t of ['InspectionUD', 'InspectionDefect', 'InspectionTrans']) await execute(`delete from ${t} where ID=@i`, { i: r.ID });
      }
    };
    const snap = async () => {
      const ids = (await query('select ID from InspectionTrans where InspectionLotNo=@l', { l: lot })).map((r) => String(r.ID)).filter((x) => !before.has(x));
      const K = (x) => ids.reduce((a, id) => a.split(id).join('KEY'), x);
      return {
        trans: rowsText(await query(`select * from InspectionTrans where InspectionLotNo=@l and ID in (${ids.join(',') || 0})`, { l: lot })).map(K),
        ud: rowsText(await query(`select * from InspectionUD where ID in (${ids.join(',') || 0})`)).map(K),
        head: rowsText(await query('select * from InspectionHeader where InspectionLotNo=@l', { l: lot })),
        bars: rowsText(await query('select BarcodeNo, UDID, QCStatus, StorageCode from MaterialBarcode where InspectionLotNo=@l', { l: lot })).map(K),
        stock: rowsText(await query(`select * from MaterialStock s where ${stockKey}`, { l: lot })),
      };
    };
    try {
      const vals = { TextBox2: 'ZZP inspected' };
      const steps = [{ handler: 'Page_Load', control: 'TitleControl', values: {} }, { handler: 'Go_Click', control: 'Go', values: { TBBarcode: c.Serial } }, { handler: 'DDLStatus_SelectedIndexChanged', control: 'DDLStatus', values: { DDLStatus: '12' } }, { handler: 'BTNSave_Click', control: 'TitleControl', values: vals }];
      const [o] = original([{ id: 0, mode: 'event', key: null, viewState: { PendingQty: '0' }, steps, ctx, spec: specOf(spec) }]);
      const afterO = await snap();
      await restore();
      const state = await newFormState(spec, ctx);
      const v = Object.fromEntries(state.controls.filter((x) => x.id).map((x) => [x.id, x.type === 'GridView' ? x.rows : (x.value ?? '')]));
      let vs = { ...state.viewState, PendingQty: '0' };
      const ev = async (nm, patch) => {
        Object.assign(v, patch);
        const r = await PAGE_EVENTS[spec.file][nm](v, eventHelpers(spec, ctx, v, { viewState: vs }));
        for (const [k, p] of Object.entries(r.set ?? {})) {
          if ('value' in p) v[k] = p.value;
          if ('index' in p) v[k] = (p.options ?? state.controls.find((x) => x.id === k)?.options ?? [])[p.index]?.value ?? '';
          if (p.rows) v[k] = p.rows;
        }
        if (r.viewState) vs = r.viewState;
        return r;
      };
      await ev('Go', { TBBarcode: c.Serial });
      await ev('DDLStatus', { DDLStatus: '12' });
      Object.assign(v, vals);
      const n = await PAGE_SAVE[spec.file](v, { ...eventHelpers(spec, ctx, v, { viewState: vs }), raw: v });
      const afterN = await snap();
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      const t = o.result?.title ?? {};
      if (o.ok && !!t.success !== (n.ok !== false)) problems.push(`TitleControl ${JSON.stringify(t)} alerts ${JSON.stringify(o.result.alerts)} vs ok=${n.ok} "${n.message}"`);
      for (const k of Object.keys(afterO)) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k]).slice(0, 400)} vs ${JSON.stringify(afterN[k]).slice(0, 400)}`);
      results.push([`Final Inspection save (${name}, lot ${lot})`, problems.length ? problems.join(' | ') : `IDENTICAL (${n.ok === false ? `fails alike: ${n.message}` : `saved, ${afterN.trans.length} inspection row`})`]);
    } finally {
      await restore();
    }
  }
}

// ---- NCMR confirmation (Footer save) ---------------------------------------------------------------------------------
// The NCMR barcode is shown (Go), a decision taken and saved through the Footer, on the original then the new app; the
// inspection row, barcode and its stock rows are saved before and restored after, and compared.
{
  const spec = SPECS['/quality/ncmrconfirmation'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const c = (await query("select top 1 mb.Serial, mb.BarcodeNo, it.ID from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where it.Status=15 and mb.QCStatus in (11,15) order by it.ID desc"))[0];
  if (c) {
    const trans = (await query('select * from InspectionTrans where ID=@i', { i: c.ID }))[0];
    const bar = (await query('select * from MaterialBarcode where BarcodeNo=@b', { b: c.BarcodeNo }))[0];
    const stockKey = 'exists (select 1 from MaterialBarcode b where b.BarcodeNo=@b and b.Material=s.Material and b.StorageCode=s.StorageCode and b.Batch=s.Batch)';
    const stock = await query(`select * from MaterialStock s where ${stockKey}`, { b: c.BarcodeNo });
    const lots = new Set((await query('select InspectionLotNo from InspectionHeader where Material=@m', { m: bar.Material })).map((r) => String(r.InspectionLotNo)));
    const restore = async () => {
      const tc = ['NextAction', 'NCMRBy', 'NCMRRemark', 'NCMROn', 'ApprovedOn', 'ApprovedBy'];
      await execute(`update InspectionTrans set ${tc.map((k, i) => `[${k}]=@p${i}`).join(',')} where ID=@i`, { i: c.ID, ...Object.fromEntries(tc.map((k, i) => [`p${i}`, trans[k]])) });
      await execute('update MaterialBarcode set QCStatus=@q, LastMaintained=@l, InspectionLotNo=@n where BarcodeNo=@b', { q: bar.QCStatus, l: bar.LastMaintained, n: bar.InspectionLotNo, b: c.BarcodeNo });
      await execute(`delete s from MaterialStock s where ${stockKey}`, { b: c.BarcodeNo });
      const sc = Object.keys(stock[0] ?? {});
      for (const r of stock) await execute(`set identity_insert MaterialStock on; insert into MaterialStock(${sc.join(',')}) values (${sc.map((_, i) => `@p${i}`).join(',')}); set identity_insert MaterialStock off`, Object.fromEntries(sc.map((k, i) => [`p${i}`, r[k]])));
      for (const r of await query('select InspectionLotNo from InspectionHeader where Material=@m', { m: bar.Material })) if (!lots.has(String(r.InspectionLotNo))) await execute('delete from InspectionHeader where InspectionLotNo=@l', { l: r.InspectionLotNo });
    };
    const snap = async () => ({
      trans: rowsText(await query('select NextAction, NCMRBy, NCMRRemark, case when NCMROn is null then 0 else 1 end NCMROn, case when ApprovedOn is null then 0 else 1 end ApprovedOn, ApprovedBy from InspectionTrans where ID=@i', { i: c.ID })),
      bar: rowsText(await query('select QCStatus, case when LastMaintained is null then 0 else 1 end LM, case when InspectionLotNo=@n then 0 else 1 end NewLot from MaterialBarcode where BarcodeNo=@b', { b: c.BarcodeNo, n: bar.InspectionLotNo })),
      stock: rowsText(await query(`select * from MaterialStock s where ${stockKey}`, { b: c.BarcodeNo })),
    });
    for (const [name, status, action] of [['approve', '12', '1'], ['reject', '13', '2']]) {
      try {
        await restore();
        const vals = { DDLApproverAction: action, TBApproverRemark: 'ZZP ncmr' };
        const steps = [{ handler: 'Page_Load', control: 'TitleControl', values: {} }, { handler: 'Go_Click', control: 'Go', values: { TBBarcode: c.Serial } }, { handler: 'DDLApproverStatus_SelectedIndexChanged', control: 'DDLApproverStatus', values: { DDLApproverStatus: status } }, { target: 'Footer', handler: 'BtnSave_Click', control: 'Footer', values: vals }];
        const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx, spec: specOf(spec) }]);
        const afterO = await snap();
        await restore();
        const state = await newFormState(spec, ctx);
        const v = Object.fromEntries(state.controls.filter((x) => x.id).map((x) => [x.id, x.type === 'GridView' ? x.rows : (x.value ?? '')]));
        let vs = { ...state.viewState };
        const ev = async (nm, patch) => {
          Object.assign(v, patch);
          const r = await PAGE_EVENTS[spec.file][nm](v, eventHelpers(spec, ctx, v, { viewState: vs }));
          for (const [k, p] of Object.entries(r.set ?? {})) if ('value' in p) v[k] = p.value;
          if (r.viewState) vs = r.viewState;
          return r;
        };
        await ev('Go', { TBBarcode: c.Serial });
        await ev('DDLApproverStatus', { DDLApproverStatus: status });
        const n = await ev('Footer:save', vals);
        const afterN = await snap();
        const problems = [];
        if (!o.ok) problems.push(`original ERROR ${o.error}`);
        const oa = (o.result?.alerts ?? []).join('|');
        const na = (n.alerts ?? (n.alert ? [n.alert] : [])).join('|');
        if (o.ok && oa !== na) problems.push(`alerts "${oa}" vs "${na}"`);
        for (const k of Object.keys(afterO)) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k]).slice(0, 300)} vs ${JSON.stringify(afterN[k]).slice(0, 300)}`);
        results.push([`NCMR confirmation ${name} (barcode ${c.Serial})`, problems.length ? problems.join(' | ') : `IDENTICAL (${n.reset ? 'saved' : `alert "${na}"`})`]);
      } finally {
        await restore();
      }
    }
  }
}

// ---- Rework confirmation (Footer save) -------------------------------------------------------------------------------
// A rejected barcode under rework is scanned, root cause / resolution chosen and saved on the original then the new app;
// the inspection row, its lot, the barcode and any new lot are restored after each, and compared.
{
  const spec = SPECS['/quality/reworkconfirmation'];
  const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
  const c = (await query("select top 1 mb.Serial, mb.BarcodeNo, mb.Material, it.ID, it.InspectionLotNo from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where mb.QCStatus=13 and it.Status<>12 and it.NextAction=1 order by it.ID desc"))[0];
  if (c) {
    const trans = (await query('select * from InspectionTrans where ID=@i', { i: c.ID }))[0];
    const head = (await query('select Status from InspectionHeader where InspectionLotNo=@l', { l: c.InspectionLotNo }))[0];
    const bar = (await query('select QCStatus, InspectionLotNo from MaterialBarcode where BarcodeNo=@b', { b: c.BarcodeNo }))[0];
    const lots = new Set((await query('select InspectionLotNo from InspectionHeader where Material=@m', { m: c.Material })).map((r) => String(r.InspectionLotNo)));
    const restore = async () => {
      const tc = ['RootCause', 'ReworkResolution', 'ApprovedBy', 'ApproverRemark', 'ApprovedOn'];
      await execute(`update InspectionTrans set ${tc.map((k, i) => `[${k}]=@p${i}`).join(',')} where ID=@i`, { i: c.ID, ...Object.fromEntries(tc.map((k, i) => [`p${i}`, trans[k]])) });
      await execute('update InspectionHeader set Status=@s where InspectionLotNo=@l', { s: head.Status, l: c.InspectionLotNo });
      await execute('update MaterialBarcode set QCStatus=@q, InspectionLotNo=@n where BarcodeNo=@b', { q: bar.QCStatus, n: bar.InspectionLotNo, b: c.BarcodeNo });
      for (const r of await query('select InspectionLotNo from InspectionHeader where Material=@m', { m: c.Material })) if (!lots.has(String(r.InspectionLotNo))) await execute('delete from InspectionHeader where InspectionLotNo=@l', { l: r.InspectionLotNo });
    };
    const snap = async () => {
      const fresh = (await query('select * from InspectionHeader where Material=@m', { m: c.Material })).filter((r) => !lots.has(String(r.InspectionLotNo)));
      return {
        trans: rowsText(await query('select RootCause, ReworkResolution, ApprovedBy, ApproverRemark, case when ApprovedOn is null then 0 else 1 end ApprovedOn from InspectionTrans where ID=@i', { i: c.ID })),
        head: rowsText(await query('select Status from InspectionHeader where InspectionLotNo=@l', { l: c.InspectionLotNo })),
        bar: rowsText((await query('select QCStatus, InspectionLotNo from MaterialBarcode where BarcodeNo=@b', { b: c.BarcodeNo })).map((r) => ({ QCStatus: r.QCStatus, NewLot: fresh.some((x) => String(x.InspectionLotNo) === String(r.InspectionLotNo)) }))),
        fresh: rowsText(fresh.map(({ InspectionLotNo, Alias, DocDate, ...r }) => r)),
      };
    };
    const root = String((await query('select top 1 ID from RootCause where status=1 order by ID'))[0]?.ID ?? '');
    const res = String((await query('select top 1 ID from ReworkResolution where status=1 order by ID'))[0]?.ID ?? '');
    for (const [name, vals] of [['with resolution', { DDLRootCause: root, SSLActionTaken: res, TBApproverRemark: 'ZZP rework' }], ['no resolution', { DDLRootCause: root, SSLActionTaken: '', TBApproverRemark: 'ZZP rework' }]]) {
      try {
        await restore();
        const steps = [{ handler: 'Page_Load', control: 'TitleControl', values: {} }, { handler: 'Go_Click', control: 'Go', values: { TBBarcode: c.Serial } }, { target: 'Footer', handler: 'BtnSave_Click', control: 'Footer', values: vals }];
        const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx, spec: specOf(spec) }]);
        const afterO = await snap();
        await restore();
        const state = await newFormState(spec, ctx);
        const v = Object.fromEntries(state.controls.filter((x) => x.id).map((x) => [x.id, x.type === 'GridView' ? x.rows : (x.value ?? '')]));
        let vs = { ...state.viewState };
        const ev = async (nm, patch) => {
          Object.assign(v, patch);
          const r = await PAGE_EVENTS[spec.file][nm](v, eventHelpers(spec, ctx, v, { viewState: vs }));
          for (const [k, p] of Object.entries(r.set ?? {})) if ('value' in p) v[k] = p.value;
          if (r.viewState) vs = r.viewState;
          return r;
        };
        await ev('Go', { TBBarcode: c.Serial });
        const n = await ev('Footer:save', vals);
        const afterN = await snap();
        const problems = [];
        if (!o.ok) problems.push(`original ERROR ${o.error}`);
        const oa = (o.result?.alerts ?? []).join('|');
        const na = (n.alerts ?? (n.alert ? [n.alert] : [])).join('|');
        if (o.ok && oa !== na) problems.push(`alerts "${oa}" vs "${na}"`);
        for (const k of Object.keys(afterO)) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k]).slice(0, 300)} vs ${JSON.stringify(afterN[k]).slice(0, 300)}`);
        results.push([`Rework confirmation ${name} (barcode ${c.Serial})`, problems.length ? problems.join(' | ') : `IDENTICAL (${n.reset ? 'saved' : `alert "${na}"`})`]);
      } finally {
        await restore();
      }
    }
  }
}

for (const [r, m] of results) console.log(`${m.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 600));
process.exit(0);
