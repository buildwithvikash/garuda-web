// Process Guide (View/Production/ProcessGuideForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, execute } from '../../../../db/pool.js';
import { netString, netInt, exceptionAlert } from '../../../../shared/net.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { settingText } from '../../../settings/settings.service.js';
import { dataTable } from '../../../../db/tables.js';
import { getPSNo, guideData, orderMaterial } from '../../../production/production.service.js';
import { NRE, errorMsg, guard, notInList, parseString, select } from '../_shared.js';
import { blankCells, guideFile, guideStation, htmlCell } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LOAD } from '../registry.js';

// ViewState: ProcessCode (the scanned station's process), StationTag (TBWorkStation's Tag), __CardGo / __StationGo
// (BtnWorderScan / btnStation texts).

const PROCESS_GUIDE = 'View/Production/ProcessGuideForm.aspx';

const LOGGED_IN = 'Select w.Name[Station],u.UserName,pl.Login,pl.UserCode from ProcessUserLogin pl inner join WorkCenter w on pl.Station =w.StationCode inner join users u on pl.UserCode=u.UserCode where pl.Status =1';

const loggedIn = async () => blankCells(await dataTable(LOGGED_IN));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// DateTime.Now.ToString("dd-MMM-yyyy HH:mm:ss")
const nowStamp = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${[d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}`;

PAGE_INIT[PROCESS_GUIDE] = async (controls, vs) => Object.assign(vs, { __CardGo: 'Go', __StationGo: 'Go' });

// Page_Load: BU and department of the session (department fixed), the user, the logged-in operators. A value not in
// its list throws there (the rest of the load is skipped).
PAGE_LOAD[PROCESS_GUIDE] = async (controls, ctx) => {
  const byId = (id) => controls.find((c) => c.id === id);
  const pickIn = (id, value) => {
    const c = byId(id);
    if (!c.options.some((o) => o.value === value)) throw notInList(id);
    c.value = value;
    return c;
  };
  try {
    pickIn('DDLBusinessUnit', netString(ctx.businessUnit));
    const dept = byId('DDLDepartment');
    if (dept.options.length === 2) dept.value = dept.options[1].value;
    if (netString(ctx.department) !== '') pickIn('DDLDepartment', netString(ctx.department)).enabled = false;
    pickIn('DDLUser', netString(ctx.userCode));
    byId('GvUsers').rows = await loggedIn();
  } catch (e) {
    return { alert: exceptionAlert(e.message) };
  }
};

Object.assign(PAGE_EVENTS, {
  [PROCESS_GUIDE]: {
    BtnWorkStationScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (netInt(settingText('WorkStationScan', '1')) === 0 && netString(v.DDLDepartment) === '') {
          out.alert = errorMsg('Select Departmet');
          return out;
        }
        const ws = netString(v.TBWorkStation);
        if (ws === '') return out;
        out.viewState.ProcessCode = '';
        const r = await guideStation(ws, v, h, out);
        if (r.ok) {
          const [code, alias] = r.rtn.split('~');
          Object.assign(out.viewState, { ProcessCode: r.process, StationTag: code });
          out.set.TBWorkStation = { value: alias };
        } else {
          out.alert = errorMsg('Invalid Work Center');
          out.set.TBWorkStation = { value: '' };
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBWorkStation = { value: '' };
      }
      return out;
    },
    BtnWorderScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__CardGo === 'Clr') {
          Object.assign(out.set, { TBJobCoard: { value: '', enabled: true }, BtnWorderScan: { text: 'Go' }, WorkStationPanel: { visible: true }, JobCardPanel: { visible: true }, RightTopPanel: { visible: false } });
          out.viewState.__CardGo = 'Go';
          return out;
        }
        const ps = await getPSNo(netString(v.TBJobCoard));
        if (ps === '') {
          out.alert = errorMsg('Invalid Barcode');
          out.set.TBJobCoard = { value: '' };
          return out;
        }
        if (h.vs.ProcessCode === undefined) throw NRE(); // ViewState["ProcessCode"].ToString()
        const g = await guideData(ps, netString(h.vs.ProcessCode));
        // FillGuide, then BtnGuide_Click: the list always holds its blank item, so the guide panels open
        Object.assign(out.set, {
          GVInstruction: { rows: blankCells(g.instructions), visible: g.instructions.length > 0 },
          LBGuideFiles: { options: g.files, index: 0 },
          RightTopPanel: { visible: true },
          RightPanel: { visible: true },
          RightTop: { visible: true },
          RightBottom: { visible: true },
        });
        if (g.files.length > 1) {
          out.set.LBGuideFiles.index = 1;
          out.set.GuideFileDisplayPanel = guideFile(g.files[1].value);
        }
        out.set.BtnWorderScan = { text: 'Clr' };
        out.viewState.__CardGo = 'Clr';
        out.set.GV = { rows: blankCells(await orderMaterial(ps)) };
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBJobCoard = { value: '' };
      }
      return out;
    },
    LBGuideFiles: async (v) => ({ set: { GuideFileDisplayPanel: guideFile(netString(v.LBGuideFiles)) } }),
    IMBGuideClose: async () => ({ set: { RightTopPanel: { visible: false } } }),
    btnLogin: async (v, h) => {
      const out = { set: {} };
      try {
        let [userCode, pass] = [netString(v.DDLUserCode), netString(v.TbPass)];
        if (netString(v.TbScanQrCode) !== '') {
          const up = netString(v.TbScanQrCode).trim().split('|');
          if (up.length > 1) {
            await select(h, out, 'DDLUserCode', up[0]);
            [userCode, pass] = [up[0], up[1]];
            out.set.TbPass = { value: pass };
          }
        }
        if (netString(v.DDLStation) === '') {
          out.set.TbScanQrCode = { value: '' };
          out.alert = errorMsg('Select a Station');
          return out;
        }
        if (userCode === '') {
          out.set.TbScanQrCode = { value: '' };
          out.alert = errorMsg('Select a user');
          return out;
        }
        const [station, user] = [digitsOrEmpty(v.DDLStation), digitsOrEmpty(userCode)];
        // whoever is logged in at the station, and this user anywhere, logged out first
        for (const where of [`Station=${station}`, `UserCode=${user}`]) {
          const open = parseString(await scalar(`Select top 1 UserCode from ProcessUserLogin where Status=1 and ${where}`));
          if (netInt(open) > 0) await execute(`Update ProcessUserLogin set Status=2, Logout='${nowStamp()}' where UserCode=${digitsOrEmpty(open)}`);
        }
        if (parseString(await scalar(`Select Password from Users where userCode=${user}`)) === pass) {
          await execute(`Insert into ProcessUserLogin(Station,UserCode,Login,Status) values(${station},${user},'${nowStamp()}',1)`);
          out.success = true;
          Object.assign(out.set, { TbPass: { value: '' }, GvUsers: { rows: await loggedIn() }, TbScanQrCode: { value: '' } });
          await select(h, out, 'DDLStation', '');
        } else out.alert = errorMsg('Wrong Password');
      } catch (e) {
        out.set.TbScanQrCode = { value: '' };
        out.alert = exceptionAlert(e.message);
      }
      return out;
    },
    // GvUsers_RowCommand "Logout": the row's operator logged out (Cells[4]: UserCode)
    'GvUsers:Logout': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const row = (Array.isArray(v.GvUsers) ? v.GvUsers : [])[h.index];
        if (!row) throw NRE();
        await execute(`Update ProcessUserLogin set Status=2, Logout='${nowStamp()}' where UserCode=${digitsOrEmpty(htmlCell(row.UserCode))}`);
        out.set.GvUsers = { rows: await loggedIn() };
      });
    },
    btnStation: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (netString(v.TbUserStation) === '') return out;
        if (h.vs.__StationGo === 'Go') {
          const want = netString(v.TbUserStation).trim();
          if (!(await h.options('DDLStation')).some((o) => o.value === want)) {
            out.alert = errorMsg('Invalid Station');
            out.set.TbUserStation = { value: '' };
            return out;
          }
          Object.assign(out.set, { DDLStation: { value: want }, TbScanQrCode: { value: '' }, btnStation: { text: 'Clr' } });
          out.viewState.__StationGo = 'Clr';
        } else {
          Object.assign(out.set, { btnStation: { text: 'Go' }, TbUserStation: { value: '', enabled: true } });
          out.viewState.__StationGo = 'Go';
          await select(h, out, 'DDLStation', '');
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TbUserStation = { value: '' };
      }
      return out;
    },
  },
});
