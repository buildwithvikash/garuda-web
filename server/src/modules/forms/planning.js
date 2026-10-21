// AVPlanning / AVCalander scheduling used by the Planning pages. The original built its SQL by concatenation; the
// same text is built here from values read from the database (numbers, checked) so its errors stay the same.
import { query, scalar, execute, transaction } from '../../db/index.js';
import { netString, netInt, netLong } from '../../lib/net.js';
import { parseDate } from './children.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
export const ddMMMyy = (d) => `${p2(d.getDate())}-${MON[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
const ddMMMyyyy = (d) => `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`;
const hhmm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
/** ToString("dd-MMM-yyyy HH:mm") */
export const ddMMMyyyyHHmm = (d) => `${ddMMMyyyy(d)} ${hhmm(d)}`;
/** ToString("yyyy-MM-ddTHH:mm:ss") */
export const isoLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hhmm(d)}:${p2(d.getSeconds())}`;
const addMinutes = (d, m) => new Date(d.getTime() + m * 60000);
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** DateTime.Parse(x.ToString()) of a value read from the database or written by this code */
export function dateOf(x) {
  if (x instanceof Date) return x;
  const s = netString(x).trim();
  // "dd-MMM-yy[yy][ HH:mm[:ss]]" (two-digit years: 00-29 -> 20xx, 30-99 -> 19xx)
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})(?: (\d{1,2}):\s?(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m && MON.includes(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase())) {
    const y = m[3].length === 2 ? (Number(m[3]) < 30 ? 2000 : 1900) + Number(m[3]) : Number(m[3]);
    return new Date(y, MON.indexOf(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  const d = /^\d{4}-\d\d-\d\dT/.test(s) ? new Date(s) : parseDate(s);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error('String was not recognized as a valid DateTime.');
  return d;
}
/** a number from the database spliced into SQL (".ToString()" of an int / decimal / DBNull) */
const sqlNum = (x) => {
  const s = netString(x);
  if (!/^-?\d*(\.\d+)?$/.test(s)) throw new Error(`Incorrect syntax near '${s}'.`);
  return s;
};
const minuteOfDay = (x) => {
  const d = x instanceof Date ? x : dateOf(`2000-01-01T${netString(x).slice(0, 8)}`);
  return d.getHours() * 60 + d.getMinutes();
};
/** (int)(a - b).TotalMinutes for two times of day */
const minutesBetween = (a, b) => {
  const sec = (x) => (x instanceof Date ? x.getHours() * 3600 + x.getMinutes() * 60 + x.getSeconds() : minuteOfDay(x) * 60);
  return Math.trunc((sec(a) - sec(b)) / 60);
};
function* eachDay(from, thru) {
  for (let d = dayOnly(from); d <= dayOnly(thru); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) yield d;
}

/** AVCalander.GetDayWiseStationSchedule: the first gap of processTime minutes in the station's available time from
 *  cDate on, around what is already scheduled there: { startDate, startTime, endDate, endTime } ("" when none) */
export async function stationSchedule(workcenter, cDate, processTime, tx) {
  const wc = sqlNum(workcenter);
  const cal = await query(`Select * from WorkCenterCalander where Stationcode=${wc} and ScheduledStartOn>='${cDate}' order by ScheduledStartOn`, {}, tx);
  const avail = await query(`Select workingdate,starttime,Availability from WorkCenterAvailability where StationCode=${wc} and workingdate>='${cDate}' order by workingdate,StartTime`, {}, tx);
  const from = dateOf(cDate);
  const rtn = [];
  for (const dr of cal) {
    let psno = '';
    let psdate = '';
    const s = dateOf(dr.ScheduledStartOn);
    const e = dateOf(dr.ScheduledCompeleteOn);
    const [startDate, endDate, ps] = [ddMMMyy(s), ddMMMyy(e), netString(dr.PSNo ?? dr.PsNo)];
    if (startDate === endDate) {
      rtn.push({ PSNo: ps, PDate: startDate, StartTime: minuteOfDay(s), EndTime: minuteOfDay(e), Done: '0' });
      continue;
    }
    for (const day of eachDay(s, e)) {
      const dd = ddMMMyy(day);
      for (const a of avail) {
        if (ddMMMyy(dateOf(a.workingdate)) !== dd) continue;
        const aStart = minuteOfDay(a.starttime);
        const row = { PSNo: ps, PDate: dd, Done: '0' };
        if (startDate === dd) {
          if (psno === ps && psdate === dd) Object.assign(row, { StartTime: aStart, EndTime: netInt(a.Availability) + aStart });
          else Object.assign(row, { StartTime: minuteOfDay(s), EndTime: netInt(a.Availability) + minuteOfDay(s) - minutesBetween(hhmm(s), a.starttime) });
        } else if (endDate === dd) Object.assign(row, { StartTime: aStart, EndTime: aStart + minutesBetween(hhmm(e), a.starttime) });
        else Object.assign(row, { StartTime: aStart, EndTime: netInt(a.Availability) + aStart });
        rtn.push(row);
        psno = ps;
        psdate = dd;
      }
    }
  }
  const fnl = [];
  for (const a of avail) {
    const aStart = minuteOfDay(a.starttime);
    let at = aStart;
    if (cal.length === 0 && ddMMMyyyy(from) === ddMMMyyyy(dateOf(a.workingdate)) && minuteOfDay(from) > aStart) at = minuteOfDay(from);
    const end = aStart + netInt(a.Availability);
    for (const d of rtn) {
      if (ddMMMyy(dateOf(a.workingdate)) !== d.PDate || d.Done !== '0') continue;
      if (d.StartTime === at) {
        if (d.StartTime < d.EndTime) {
          fnl.push({ PSNo: d.PSNo, PDate: d.PDate, StartTime: d.StartTime, EndTime: d.EndTime });
          at = d.EndTime + 1;
          d.Done = '1';
        }
      } else if (d.StartTime > at && d.StartTime < end && d.StartTime < d.EndTime) {
        fnl.push({ PSNo: '', PDate: d.PDate, StartTime: at, EndTime: d.StartTime - 1 });
        fnl.push({ PSNo: d.PSNo, PDate: d.PDate, StartTime: d.StartTime, EndTime: d.EndTime });
        at = d.EndTime + 1;
        d.Done = '1';
      }
    }
    if (end > at) fnl.push({ PSNo: '', PDate: ddMMMyy(dateOf(a.workingdate)), StartTime: at, EndTime: end });
  }
  const sc = { startDate: '', startTime: '', endDate: '', endTime: '' };
  let pTime = processTime;
  for (const r of fnl) {
    let m = 0;
    if (r.PSNo === '') {
      const pdate = dateOf(r.PDate);
      if (sc.startDate === '') {
        m = r.PDate === ddMMMyy(from) ? minuteOfDay(from) : 0; // a PDate is a date: its time of day is 00:00
        if (m <= r.StartTime) Object.assign(sc, { startDate: pdate, startTime: r.StartTime });
      }
      if (m <= r.StartTime) {
        const av = r.EndTime - r.StartTime;
        if (pTime <= av) {
          Object.assign(sc, { endDate: pdate, endTime: r.StartTime + pTime });
          break;
        }
        pTime -= av;
      }
    } else {
      Object.assign(sc, { startDate: '', startTime: '' });
      pTime = processTime;
    }
  }
  return sc;
}

/** AVPlanning.UpdateSchedule(dt, psNo, dw): each line with both dates updates its calendar row (or adds one) and the
 *  routing's station. The update writes the completion as "dd-MMM-yyyy HH: mm" (as written in the original). */
export async function updateSchedule(rows, tx) {
  for (const dr of rows) {
    if (netString(dr.ScheduledStartOn) === '' || netString(dr.ScheduledCompeleteOn) === '') continue;
    const [ps, proc, st] = [sqlNum(dr.PsNo ?? dr.PSNo), sqlNum(dr.ProcessCode), sqlNum(dr.StationCode)];
    const rowid = netLong(await scalar(`select ROWID from WorkCenterCalander where PSNo=${ps} and ProcessCode=${proc}`, {}, tx));
    const s = dateOf(dr.ScheduledStartOn);
    const e = dateOf(dr.ScheduledCompeleteOn);
    if (rowid > 0) await execute(`Update WorkCenterCalander set StationCode=${st}, ScheduledStartOn='${ddMMMyyyyHHmm(s)}' , ScheduledCompeleteOn = '${ddMMMyyyy(e)} ${p2(e.getHours())}: ${p2(e.getMinutes())}' where PSNo=${ps} and ProcessCode=${proc}`, {}, tx);
    else await execute(`insert into  WorkCenterCalander (PSNo,StationCode,ProcessCode,ScheduledStartOn,ScheduledCompeleteOn) Values(${ps},${st},${proc},'${ddMMMyyyyHHmm(s)}','${ddMMMyyyyHHmm(e)}')`, {}, tx);
    await execute(`Update ProcessRouting set StationCode=${st} where PSNo=${ps} and ProcessCode=${proc}`, {}, tx);
  }
}

const stationsOf = (proc, tx, extra = '') => query(`select w.StationCode,w.name from WorkCenter w inner join WorkCenterProcesses wp on w.StationCode=wp.StationCode where wp.ProcessCode=${proc}${extra}`, {}, tx);

/** AVPlanning.FillScheduleViewUpdateGridViewGroupHimile: the job card re-planned from one process on, that process put
 *  on the given station and times; the shown lines (cDTable) take the new stations / times and are saved. */
async function replanFromProcess(psno, station, process, cDTable, cdt, edt, tx) {
  const seqNo = String(netLong(await scalar(`Select SeqNo from ProcessRouting where  Psno=${psno} and ProcessCode=${process}`, {}, tx)));
  const calrowid = netString(await scalar(`Select RowId from WorkCenterCalander where Status=0 and Psno=${psno} and ProcessCode=${process}`, {}, tx));
  await execute(`Delete from WorkCenterCalander where Status = 0 and Psno = ${psno} and RowId >=${netLong(calrowid)}`, {}, tx);
  const dt = await query(`select ROW_NUMBER() OVER(order by pr.SeqNo ) AS RowID,pr.PSNo,pr.ProcessCode,pp.Name[Process],'0'[StationCode],''[Station],''[ScheduledStartOn],''[ScheduledCompeleteOn],''[ActualStartOn],''[ActualCompletedOn],(rt.MachineSetupTime+rt.ProcessTime)[PTime], rt.MaxHoldPeriod  from ProcessRouting pr inner join ProductionProcess pp on pr.ProcessCode=pp.ProcessCode left join RoutingTrans rt on pr.RouteCode=rt.RouteCode and pr.ProcessCode=rt.ProcessCode where pr.PSNO=${psno} and pr.SeqNo>=${seqNo} order by pr.SeqNo`, {}, tx);
  let lastStation = '0';
  let from = cdt;
  for (const dr of dt) {
    const proc = sqlNum(dr.ProcessCode);
    if (netString(dr.ProcessCode) === netString(process)) {
      Object.assign(dr, { StationCode: String(netInt(station)), ScheduledStartOn: isoLocal(dateOf(cdt)), ScheduledCompeleteOn: isoLocal(dateOf(edt)) });
      from = ddMMMyyyyHHmm(addMinutes(dateOf(dr.ScheduledCompeleteOn), 5));
      continue;
    }
    const ac = await query(`Select * from WorkCenterCalander where PSNo=${psno} and ProcessCode=${proc}`, {}, tx);
    if (ac.length) {
      const st = netString(ac[0].Status);
      if (st === '1' || st === '2') {
        Object.assign(dr, {
          StationCode: String(netInt(ac[0].StationCode)),
          ScheduledStartOn: isoLocal(dateOf(ac[0].ScheduledStartOn)),
          ScheduledCompeleteOn: isoLocal(dateOf(ac[0].ScheduledCompeleteOn)),
          ActualStartOn: isoLocal(dateOf(ac[0].ActualStartOn)),
          ActualCompletedOn: isoLocal(dateOf(ac[0].ActualCompletedOn)),
        });
        from = ddMMMyyyyHHmm(dateOf(st === '1' ? dr.ScheduledCompeleteOn : dr.ActualCompletedOn));
        continue;
      }
    }
    let stations;
    if (lastStation !== '0') {
      stations = await stationsOf(proc, tx, ` and w.StationCode=${lastStation}`);
      if (!stations.length) stations = await stationsOf(proc, tx, ' order by w.StationCode');
      else stations = [...stations, ...(await stationsOf(proc, tx, ` and w.StationCode<>${lastStation}`))];
    } else stations = await stationsOf(proc, tx, ' order by w.StationCode');
    let scd = '';
    for (const drs of stations) {
      const sc = await stationSchedule(String(netInt(drs.StationCode)), from, netInt(dr.PTime), tx);
      if (sc.startDate === '' || sc.endDate === '') continue;
      const s = addMinutes(sc.startDate, netInt(sc.startTime));
      const e = addMinutes(sc.endDate, netInt(sc.endTime));
      if (netString(dr.ScheduledStartOn) !== '' && !(s < dateOf(dr.ScheduledStartOn))) continue;
      Object.assign(dr, { StationCode: String(netInt(drs.StationCode)), Station: netString(drs.name), ScheduledStartOn: isoLocal(s), ScheduledCompeleteOn: isoLocal(e) });
      lastStation = String(netInt(drs.StationCode));
      scd = ddMMMyyyyHHmm(addMinutes(addMinutes(e, netInt(dr.MaxHoldPeriod)), 5));
    }
    if (scd !== '') from = scd;
    if (netString(dr.StationCode) === '0' && stations.length) {
      Object.assign(dr, { StationCode: String(netInt(stations[0].StationCode)), Station: netString(stations[0].name) });
      lastStation = String(netInt(dr.Station)); // (the station's name parsed as a number, as written)
    }
  }
  for (const r of cDTable) {
    const m = dt.find((x) => netString(x.ProcessCode) === netString(r.ProcessCode));
    if (m) Object.assign(r, { StationCode: m.StationCode, ScheduledStartOn: m.ScheduledStartOn, ScheduledCompeleteOn: m.ScheduledCompeleteOn });
  }
  await updateSchedule(cDTable, tx);
}

const existingSql = (ps) =>
  `Select distinct wc.RowID,wc.PSNo,wc.StationCode,w.Name[Station],pp.ProcessCode,pp.Name[Process],format([ScheduledStartOn],'yyyy-MM-ddTHH:mm:ss')[ScheduledStartOn] ,format([ScheduledCompeleteOn],'yyyy-MM-ddTHH:mm:ss')[ScheduledCompeleteOn],format([ActualStartOn],'yyyy-MM-ddTHH:mm:ss')[ActualStartOn] ,format([ActualCompletedOn],'yyyy-MM-ddTHH:mm:ss')[ActualCompletedOn] ,  (rt.MachineSetupTime+rt.ProcessTime+rt.MaxHoldPeriod)[PTime] from WorkcenterCalander wc inner join ProductionProcess pp on wc.ProcessCode=pp.ProcessCode inner join WorkCenter w on wc.StationCode=w.StationCode inner join  ProcessRouting pr on pr.ProcessCode=pp.ProcessCode and pr.PSNo=wc.PSNo and pr.ProcessCode=wc.ProcessCode left join RoutingTrans rt on pr.RouteCode=rt.RouteCode and pr.ProcessCode=rt.ProcessCode and rt.SeqNo=pr.SeqNo where wc.PSNo=${ps} order by wc.rowid asc`;

/** AVPlanning.GroupResetScheduleHimile: for each station-scan process of the job card's route, the other job cards of
 *  its production order follow the station and times of the one scheduled first after the previous process. */
export async function groupResetSchedule(psno) {
  const ps = sqlNum(psno);
  const route = await query(`Select ProdNo,Routing from ProcessOrder where PSNO=${ps}`);
  if (!route.length) throw new Error('No Routing Defined');
  const [prod, routing] = [sqlNum(route[0].ProdNo), sqlNum(route[0].Routing)];
  const procs = await query(`Select  routecode,ProcessCode,seqNo  from RoutingTrans where routecode=${routing} and StationScan=1`);
  await transaction(async (tx) => {
    for (const dr of procs) {
      const prev = await scalar(`Select  Top 1 ProcessCode  from RoutingTrans where routecode=${sqlNum(dr.routecode)} and SeqNo<${sqlNum(dr.seqNo)}Order by SeqNo desc`, {}, tx);
      if (prev === null || prev === undefined) throw new Error('Object reference not set to an instance of an object.'); // ExecuteScalar(...).ToString()
      const maxPrev = await query(`Select  top 1 PsNo,Max(ScheduledCompeleteOn )[ScheduledCompeleteOn] from WorkCenterCalander where PSNo in( Select psno from ProcessOrder where PRODNo=${prod} and Routing=${routing})  and ProcessCode=${sqlNum(prev)} group by PsNo order by Max(ScheduledCompeleteOn ) desc`, {}, tx);
      if (!maxPrev.length) throw new Error('There is no row at position 0.');
      const after = isoLocal(dateOf(maxPrev[0].ScheduledCompeleteOn));
      const first = await query(`Select  top 1 PsNo,Min(ScheduledStartOn )[ScheduledStartOn] from WorkCenterCalander where ScheduledStartOn > ='${after}' and  PSNo in( Select psno from ProcessOrder where PRODNo=${prod} and Routing=${routing})  and ProcessCode=${sqlNum(dr.ProcessCode)} group by PsNo order by Min(ScheduledStartOn ) asc`, {}, tx);
      if (!first.length) continue;
      const st = await query(`Select StationCode,ScheduledStartOn,ScheduledCompeleteOn   from WorkCenterCalander  where PSNo=${sqlNum(first[0].PsNo)} and ProcessCode=${sqlNum(dr.ProcessCode)}`, {}, tx);
      if (!st.length) continue;
      const others = await query(`Select psno from ProcessOrder where PsNo!=${sqlNum(first[0].PsNo)} and PRODNo=${prod} and Routing=${routing}`, {}, tx);
      for (const o of others) {
        const shown = await query(existingSql(sqlNum(o.psno)), {}, tx);
        await replanFromProcess(sqlNum(o.psno), netString(st[0].StationCode), sqlNum(dr.ProcessCode), shown, st[0].ScheduledStartOn, st[0].ScheduledCompeleteOn, tx);
      }
    }
  });
}

/** AVPlanning.DeleteScheduleHimile: the job card's calendar rows not started */
export const deleteSchedule = (psno) => execute(`Delete from WorkCenterCalander where Status=0 and Psno=${sqlNum(psno)}`);

/** AVPlanning.UpdateSchedule(dt, psNo): every line needs a station; its calendar row updated (or added with both
 *  dates) and the routing's station set, in one transaction */
export async function saveSchedule(rows) {
  await transaction(async (tx) => {
    for (const dr of rows) {
      if (netString(dr.StationCode) === '') throw new Error('Station cant be blank for any prcoess');
      const [ps, proc, st] = [sqlNum(dr.PsNo ?? dr.PSNo), sqlNum(dr.ProcessCode), sqlNum(dr.StationCode)];
      const rowid = netLong(await scalar(`select ROWID from WorkCenterCalander where PSNo=${ps} and ProcessCode=${proc}`, {}, tx));
      if (rowid > 0) {
        const s = dateOf(dr.ScheduledStartOn);
        const e = dateOf(dr.ScheduledCompeleteOn);
        await execute(`Update WorkCenterCalander set StationCode=${st}, ScheduledStartOn='${ddMMMyyyyHHmm(s)}' , ScheduledCompeleteOn = '${ddMMMyyyy(e)} ${p2(e.getHours())}: ${p2(e.getMinutes())}' where PSNo=${ps} and ProcessCode=${proc}`, {}, tx);
      } else if (netString(dr.ScheduledStartOn) !== '' && netString(dr.ScheduledCompeleteOn) !== '') {
        await execute(`insert into  WorkCenterCalander (PSNo,StationCode,ProcessCode,ScheduledStartOn,ScheduledCompeleteOn) Values(${ps},${st},${proc},'${ddMMMyyyyHHmm(dateOf(dr.ScheduledStartOn))}','${ddMMMyyyyHHmm(dateOf(dr.ScheduledCompeleteOn))}')`, {}, tx);
      }
      await execute(`Update ProcessRouting set StationCode=${st} where PSNo=${ps} and ProcessCode=${proc}`, {}, tx);
    }
  });
}
