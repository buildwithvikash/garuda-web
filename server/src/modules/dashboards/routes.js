import { Router } from 'express';
import { WRL_DASHBOARDS } from './pages.js';
import { currentShiftAndPeriod, shiftHeader } from './shift.js';
import * as wrl from './wrl.js';
import { readSession, writeSession } from '../../lib/session.js';
import { canOpen, userMenu } from '../menu/service.js';
import { query } from '../../db/index.js';
import { netString, netDouble } from '../../lib/net.js';

export const dashboardRoutes = Router();

/**
 * Dashboards accept ?UCode=<UserCode>&BU=<unit> without a login so shop-floor TVs can show them (original Page_Load
 * copied both into Session). Here that creates a kiosk session that only works for dashboard APIs.
 */
async function sessionOrKiosk(req, res, next) {
  try {
    let s = readSession(req);
    const ucode = netString(req.query.UCode).trim();
    if ((!s || s.kiosk) && /^\d+$/.test(ucode) && s?.userCode !== ucode) {
      const u = await query('select UserCode, UserID from Users where UserCode=@ucode', { ucode });
      if (u.length) {
        s = { userCode: ucode, userId: netString(u[0].UserID), businessUnit: netString(req.query.BU), kiosk: true };
        writeSession(res, s);
      }
    }
    if (!s?.userCode) return res.status(401).json({ message: 'Login required' });
    req.session = s;
    next();
  } catch (e) {
    next(e);
  }
}

async function panelData(p, shift) {
  if (p.kind === 'monthly') return wrl.monthly(p.process, p.variant);
  if (p.kind === 'static' || !shift) return null;
  switch (p.kind) {
    case 'foamDial':
      return wrl.foamDial(shift, p.station, p.activity, p.remark);
    case 'cabinetDial':
      return wrl.cabinetDial(shift, p.station, p.remark);
    case 'hourly':
      return wrl.hourly(shift, p.hourly, p.selection);
    case 'quality':
      return wrl.quality(shift, p.processes, p.selection);
    case 'station':
      return wrl.stationStatus(p.location);
    case 'brazing': {
      const out = [];
      for (const st of p.stations) out.push(await wrl.brazingStation(shift, st, p.sql));
      return out;
    }
    default:
      return null;
  }
}

// Reports/WRLCHEM.aspx (ISO) and WRLCHEM2.aspx (POLY): latest reading of two chemical tanks, truncated to integers.
const HMI = { wrlchem: { moduleId: 9022, tanks: ['ISO Tank - 1', 'ISO Tank - 2'] }, wrlchem2: { moduleId: 9023, tanks: ['Poly Tank - 1', 'Poly Tank - 2'] } };
dashboardRoutes.get('/hmi/:page', sessionOrKiosk, async (req, res, next) => {
  try {
    const page = HMI[req.params.page];
    if (!page) return res.status(404).json({ message: 'Not found' });
    if (!(await canOpen(req.session.userCode, page.moduleId))) return res.status(403).json({ message: 'You do not have access to this screen' });
    const tanks = [];
    for (const tank of page.tanks) {
      const rows = await query('select top 1 [WeightValue],[LevelValue],[TempValue] from [dbo].[ChemTankReadings] where [TankCode] =@tank order by [RowID] desc', { tank });
      const t = (v) => String(Math.trunc(netDouble(netString(v)))); // Math.Truncate(ParseDouble(...)).ToString()
      tanks.push(rows.length ? { weight: t(rows[0].WeightValue), level: t(rows[0].LevelValue), temp: t(rows[0].TempValue) } : { weight: '', level: '', temp: '' });
    }
    res.json({ tanks });
  } catch (e) {
    next(e);
  }
});

dashboardRoutes.get('/wrl/:slug', sessionOrKiosk, async (req, res, next) => {
  try {
    const page = WRL_DASHBOARDS[req.params.slug];
    if (!page) return res.status(404).json({ message: 'Not found' });
    const allowed = page.moduleId == null ? (await userMenu(req.session.userCode)).systemUser : await canOpen(req.session.userCode, page.moduleId);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this screen' });

    const shift = await currentShiftAndPeriod(page.dept);
    const header = shiftHeader(shift);
    if (page.durationSep && shift) header.duration = header.duration.replace(' To ', page.durationSep);
    const panels = [];
    for (const p of page.panels) {
      const { sql, ...spec } = p; // never send SQL to the browser
      try {
        panels.push({ ...spec, data: await panelData(p, shift) });
      } catch (e) {
        console.error(`dashboard ${req.params.slug} panel ${p.kind} ${p.station ?? ""}`, e.message);
        panels.push({ ...spec, data: null, error: e.message });
      }
    }
    res.json({ slug: req.params.slug, title: page.title, header, next: page.next, kiosk: !!req.session.kiosk, panels });
  } catch (e) {
    next(e);
  }
});
