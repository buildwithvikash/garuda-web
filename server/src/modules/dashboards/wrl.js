// Port of Avatar.Business.AVWRLDashboards. Each function returns what the original wrote into its controls
// (gauge value, grid rows, label texts, chart rows), formatted the way .NET formatted it.
// SQL text matches the original; values are passed as parameters.
import { query, scalar } from '../../db/index.js';
import { netString, netDouble, netLong, netInt, netNum, netFixed1, roundHalfEven } from '../../lib/net.js';

const dbl = async (sql, p) => netDouble(netString(await scalar(sql, p)));

const DEPART = 'select top 1 Department  from WorkCenter where StationCode =@station';
// Original concatenates the department into SQL; a station missing from WorkCenter produced
// "Department= and ..." and the page failed with this SQL Server error. Kept, but the route shows it per panel.
async function departmentOf(station) {
  const depart = netString(await scalar(DEPART, { station }));
  if (depart === '') throw new Error("Incorrect syntax near the keyword 'and'.");
  return depart;
}
const planDate = (shift) => shift.STimeStamp.split(' ')[0];
const window = (shift) => ({ s: shift.STimeStamp, e: shift.ETimeStamp, d: planDate(shift), shiftCode: shift.ShiftCode });

/** Grid rows shared by the dial methods. */
function dialRows(planQty, actualQty) {
  const percentage = planQty !== 0 ? (actualQty / planQty) * 100 : 0;
  return [
    ['Plan Target', netNum(planQty)],
    ['Actual', netNum(actualQty)],
    ['Difference', netNum(planQty - actualQty)],
    ['Percentage (%)', netFixed1(percentage)],
    ['Balance Qty', netNum(planQty - actualQty)],
  ];
}

// FoamDialAssginValues / ...SUS / ...VISI. remark: null | '12304' (SUS) | '12605' (VISI).
export async function foamDial(shift, station, activityType, remark = null) {
  const w = window(shift);
  const depart = await departmentOf(station);
  const planQty = await dbl(
    "Select top 1 PlanQty from DailyPlan Where Department=@depart and Station =@station and Format(PlanDate,'dd-MMM-yyyy')=@d and Shift=@shiftCode",
    { depart, station, d: w.d, shiftCode: w.shiftCode },
  );
  const col = activityType === '1' ? 'StartedOn' : 'CompletedOn';
  let actualQty;
  if (!remark) {
    const status = activityType === '1' ? 'Status in (2)' : 'Status=2';
    actualQty = await dbl(`Select count(Distinct PSNo)[total]  from ProcessRouting where ${status} and StationCode=@station and  ${col} between @s and @e`, { station, s: w.s, e: w.e });
  } else {
    actualQty = await dbl(
      `Select count(Distinct PR.PSNo)[total]  from ProcessRouting PR INNER JOIN ProcessActivity PA ON PA.PSNo = PR.PSNo where PR.Status=2 and PR.StationCode=@station AND PA.Remark =@remark and PR.${col} between @s and @e`,
      { station, remark, s: w.s, e: w.e },
    );
  }
  return { value: netNum(actualQty), rows: dialRows(planQty, actualQty) };
}

// CabinetDialAssginValues / ...VISI (no "top 1" on the plan query, as in the original).
export async function cabinetDial(shift, station, remark = null) {
  const w = window(shift);
  const depart = await departmentOf(station);
  const planQty = await dbl(
    "Select PlanQty from DailyPlan Where Department =@depart and Station =@station and Format(PlanDate,'dd-MMM-yyyy')=@d and Shift=@shiftCode",
    { depart, station, d: w.d, shiftCode: w.shiftCode },
  );
  const actualQty = remark
    ? await dbl(
        'Select count(Distinct PR.PSNo)[total]  from ProcessRouting PR INNER JOIN ProcessActivity PA ON PA.PSNo = PR.PSNo where PR.Status = 2 and PR.StationCode = @station  AND PA.Remark =@remark and PR.CompletedOn between @s and @e',
        { station, remark, s: w.s, e: w.e },
      )
    : await dbl('Select count(Distinct PSNo)[total]  from ProcessRouting where Status = 2 and StationCode = @station and CompletedOn between @s and @e', { station, s: w.s, e: w.e });
  return { value: netNum(actualQty), rows: dialRows(planQty, actualQty) };
}

// LabelAssignValues / LabelAssignValuesPreAssem / LabelAssignValuesVISI.
export async function monthly(process, variant = 'default', now = new Date()) {
  let actualQty;
  let planQty;
  if (variant === 'preAssem') {
    actualQty = netLong(netString(await scalar('select  count(psno)  from ProcessRouting where month(StartedOn) = month(getdate()) and status = 1 and ProcessCode = @process', { process })));
    planQty = netLong(netString(await scalar('select top 1 PlanQty from MonthlyPlan where  PlanMonth= MONTH(GETDATE())')));
  } else {
    actualQty =
      variant === 'VISI'
        ? netLong(netString(await scalar(
            "select  count(PR.psno)  from ProcessRouting PR INNER JOIN ProcessActivity PA ON PA.PSNo = PR.PSNo where month(PR.completedON) = month(getdate()) and year(PR.completedON) = year(getdate()) and PR.status = 2 AND PA.Remark ='12605' and PR.ProcessCode = @process",
            { process },
          )))
        : netLong(netString(await scalar(
            'select  count(psno)  from ProcessRouting where month(completedON) = month(getdate()) and year(completedON) = year(getdate()) and status = 2 and ProcessCode = @process',
            { process },
          )));
    planQty = netLong(netString(await scalar('select top 1 PlanQty from MonthlyPlan where  PlanMonth= MONTH(GETDATE()) and PlanYear =YEAR(GETDATE()) ')));
  }
  const remainingQty = planQty - actualQty;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - now.getDate();
  const out = {
    monthlyProductionQty: `${netNum(planQty)} Units`,
    monthlyAchievement: `${netNum(actualQty)} Units`,
    remainingQty: `${netNum(remainingQty)} Units`,
    remainingDays: '0', // label's markup default; only set when days remain
    askingRate: '0',
  };
  if (remainingDays === 0) {
    out.askingRate = `${netNum(remainingQty)} FG/day`;
    return out;
  }
  out.remainingDays = netNum(remainingDays);
  out.askingRate = `${roundHalfEven(remainingQty / remainingDays)} FG/day`;
  return out;
}

// TimeSpan.Parse(timestamp time part) -> ms since midnight.
const tsMs = (stamp) => {
  const [h, m, s] = stamp.split(' ')[1].split(':').map(Number);
  return ((h * 60 + m) * 60 + (s || 0)) * 1000;
};
const nowMs = (now) => ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();

/** FillShiftCircularProgessBar (formula kept exactly, including its handling of overnight shifts). */
export function shiftProgress(shift, now = new Date()) {
  const start = tsMs(shift.STimeStamp);
  const end = tsMs(shift.ETimeStamp);
  const cur = nowMs(now);
  const total = start > end ? start - end : end - start;
  const elapsed = cur > start ? cur - start : start - cur;
  return netFixed1((elapsed / total) * 100);
}

/** LateHours: ParseInt of TotalHours, i.e. truncated toward zero. */
export function lateHours(shift, now = new Date()) {
  return Math.trunc((nowMs(now) - tsMs(shift.STimeStamp)) / 3_600_000);
}

// PlanAndActualQty(selection)
const PLAN = "Select top 1 PlanQty from DailyPlan Where Department=@depart and Station=@station  and Format(PlanDate,'dd-MMM-yyyy')=@d and Shift=@shiftCode";
async function planFor(shift, station) {
  const w = window(shift);
  const depart = await departmentOf(station);
  return dbl(PLAN, { depart, station, d: w.d, shiftCode: w.shiftCode });
}
export async function planAndActual(shift, selection) {
  const { s, e } = window(shift);
  const routed = (stations, statusSql = 'Status = 2', col = 'CompletedOn') =>
    dbl(`Select count(Distinct PSNo)[total]  from ProcessRouting where ${statusSql} and StationCode in (${stations.map((_, i) => `@st${i}`).join(',')}) and ${col} between @s and @e`, {
      ...Object.fromEntries(stations.map((v, i) => [`st${i}`, v])),
      s,
      e,
    });
  switch (selection) {
    case 1:
      return [
        await planFor(shift, '1220009'),
        await dbl('Select Count(distinct SerialNo)[Total] from MachReadDtls Where StationCode = @station and ReadDateTime between @s and @e and LEN(SerialNo) = 14', { station: '1220009', s, e }),
      ];
    case 2:
      return [await planFor(shift, '1220001'), await routed(['1220001', '1220002'])];
    case 3:
      return [await planFor(shift, '1220010'), await routed(['1220010'])];
    case 4:
      return [await planFor(shift, '1220003'), await routed(['1220003', '1220004'])];
    case 5:
      return [await planFor(shift, '1220005'), await routed(['1230002'])];
    case 6:
      return [await planFor(shift, '1220001'), await routed(['1220001'], 'Status in(1, 2)', 'StartedOn')];
    case 7:
      return [await planFor(shift, '1220002'), await routed(['1220002'], 'Status in(1, 2)', 'StartedOn')];
    default:
      return [0, 0];
  }
}

const HOURLY_ROUTING = (stationsSql) =>
  `Select  'H'+  CAST(ROW_NUMBER()  OVER (ORDER BY dateadd(hour, datediff(hour, 0, CompletedOn), 0)) AS varchar)as Hour,Count(distinct PSNo)[Total] from ProcessRouting where StationCode ${stationsSql} and Status=2 and CompletedOn between @s and @e GROUP BY dateadd(hour, datediff(hour, 0, CompletedOn), 0) ORDER BY dateadd(hour, datediff(hour, 0, CompletedOn), 0);`;
const HOURLY_ACTIVITY =
  "Select 'H'+ CAST( ROW_NUMBER()  OVER (ORDER BY dateadd(hour, datediff(hour, 0, pa.ActivityOn), 0)) AS varchar)  as Hour,count(Distinct pr.PSNo)[Total]  from ProcessRouting pr inner join ProcessActivity pa on pr.ProcessCode=pa.ProcessCode and pr.PSNo = pa.PSNo  and pa.ActivityType = @activityType and pr.Status in(1, 2) and  pr.StationCode=@station and pa.ActivityOn between @s and @e GROUP BY dateadd(hour, datediff(hour, 0, pa.ActivityOn), 0) ORDER BY dateadd(hour, datediff(hour, 0, pa.ActivityOn), 0);";

// HourlyProductionPerformance / HourlyPreAssemblyA/B / HourlyLoadingPerformance.
export async function hourly(shift, kind, selection, now = new Date()) {
  const { s, e } = window(shift);
  const [planQty, actualQty] = await planAndActual(shift, selection);
  let chart;
  if (kind === 'production') chart = await query(HOURLY_ROUTING('in(@a,@b)'), { a: '1220001', b: '1220002', s, e });
  else if (kind === 'loading') chart = await query(HOURLY_ROUTING(' = @a'), { a: '1220005', s, e });
  else chart = await query(HOURLY_ACTIVITY, { activityType: '1', station: kind === 'preAssemblyA' ? '1220001' : '1220002', s, e });
  const pct = planQty !== 0 ? (actualQty / planQty) * 100 : 0;
  return {
    shiftProgress: shiftProgress(shift, now),
    runningHour: `Running Hour: H${lateHours(shift, now)}`,
    achievement: netFixed1(pct),
    plan: `${'Prodution Plan: '.padEnd(22)}${netNum(planQty)}`,
    achieved: `${'Production Achieved: '.padEnd(22)}${netNum(actualQty)}`,
    remaining: `${'Production Remaining: '.padEnd(22)}${netNum(planQty - actualQty)}`,
    chartTitle: kind === 'preAssemblyA' ? 'Hourly Cabinet Count' : null,
    chart: chart.map((r) => ({ label: netString(r.Hour), value: netInt(r.Total) })),
  };
}

// QualityPerformance
export async function quality(shift, processes, selection, now = new Date()) {
  const { s, e } = window(shift);
  const [planQty, actualQty] = await planAndActual(shift, selection);
  const list = processes.split(',').map((p) => p.trim());
  const defectQty = await dbl(
    `Select Count(distinct (DocNo)) From InspectionHeader where RejectedQty > 0 and Process in (${list.map((_, i) => `@p${i}`).join(',')} ) and DocDate between @s and @e`,
    { ...Object.fromEntries(list.map((v, i) => [`p${i}`, v])), s, e },
  );
  const ok = actualQty - defectQty;
  return {
    shiftProgress: shiftProgress(shift, now),
    updatedHour: `Update as on: H${lateHours(shift, now)}`,
    packing: netNum(planQty),
    actual: netNum(actualQty),
    ok: netNum(ok),
    defect: netNum(defectQty),
    okPercentage: `${netFixed1((ok / actualQty) * 100)}%`,
    defectPercentage: `${netFixed1((defectQty / actualQty) * 100)}%`,
    chart: [
      { label: 'Total Ok', value: ok },
      { label: 'Total Defects', value: defectQty },
    ],
  };
}

const today = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// WRLStationStatusDashboard (emergency stops per PLC location, today).
export async function stationStatus(location, now = new Date()) {
  const from = `${today(now)} 00:00:01.000`;
  const to = `${today(now)} 23:59:59.000`;
  const masters = await query('Select PLCLocation , MEMBit  from EMGMaster where Status =0 and Location =@location', { location });
  const rows = [];
  let sumTimesec = '0';
  let totalHit = '0';
  for (const m of masters) {
    const p = { location, plc: netString(m.PLCLocation), bit: netString(m.MEMBit), from, to };
    const t = await query(
      // Columns aliased: the driver merges unnamed columns into one array.
      'Select isnull(sum([TotalSec]),0) TotalSec,count(PLCLocation) Hits from EMGTrans where Location =@location and PLCLocation =@plc and MEMBit =@bit and EmgOn between @from and @to ',
      p,
    );
    if (t.length) [sumTimesec, totalHit] = [netString(t[0].TotalSec), netString(t[0].Hits)];
    const curSec = netString(await scalar(
      'Select datediff(SECOND ,EmgOn,GETDATE()) from EMGTrans where Location =@location and  PLCLocation =@plc and MEMBit =@bit and EmgOff is null and EmgOn between @from and @to ',
      p,
    ));
    const sec = netLong(sumTimesec) + netLong(curSec);
    sumTimesec = String(sec);
    // Original formats h:mm:ss in SQL with integer division; same arithmetic here.
    const elapsed = `${Math.trunc(sec / 3600)}:${String(Math.trunc(sec / 60) % 60).padStart(2, '0').slice(-2)}:${String(sec % 60).padStart(2, '0').slice(-2)}`;
    if (totalHit !== '0') rows.push({ Location: netString(m.PLCLocation), Time_Elapsed: elapsed, HitCount: totalHit });
  }
  return rows;
}

// BrazingDashboard / SUS / VISI AssignData: operator logged in at the station and joint inspection counts.
export async function brazingStation(shift, stationCode, jointsSql) {
  const { e } = window(shift);
  const detail = await query('Select w.Name, wp.ProcessCode from WorkCenter w inner join WorkCenterProcesses wp on w.StationCode = wp.StationCode  where w.StationCode=@stationCode', { stationCode });
  const name = detail.length ? netString(Object.values(detail[0])[0]) : null;
  const bProcess = detail.length ? netString(Object.values(detail[0])[1]) : '';
  const users = await query('Select * from Users where UserCode=(Select UserCode from ProcessUserLogin where Status = 1 and Station = @stationCode)', { stationCode });
  let operatorName = '';
  let operatorID = '';
  let operatorCode = '';
  let photo = null;
  let totalJoints = '0';
  let ok = '0';
  let nok = '0';
  let pct = '0';
  let loginT = '';
  if (users.length) {
    const u = users[0];
    operatorCode = netString(u.UserCode);
    operatorName = netString(u.UserName);
    operatorID = netString(u.UserID);
    const login = await scalar('Select Login from ProcessUserLogin where Status = 1 and UserCode = @operatorCode and Station = @stationCode', { operatorCode, stationCode });
    if (!(login instanceof Date)) throw new Error('String was not recognized as a valid DateTime.');
    const p2 = (n) => String(n).padStart(2, '0');
    loginT = `${login.getFullYear()}-${p2(login.getMonth() + 1)}-${p2(login.getDate())} ${p2(login.getHours())}:${p2(login.getMinutes())}:${p2(login.getSeconds())}`;
    if (Buffer.isBuffer(u.Photo) && u.Photo.length) photo = `data:image/png;base64,${u.Photo.toString('base64')}`;
  }
  if (operatorCode !== '') {
    const data = await query(jointsSql, { loginT, shiftEnd: e, stationCode, operatorCode, bProcess });
    if (data.length) {
      totalJoints = netString(data[0].TotalJoint);
      ok = netString(data[0].OKCOUNT);
      nok = netString(data[0].DefectCount);
      if (netDouble(totalJoints) !== 0) pct = netNum(roundHalfEven((netDouble(ok) / netDouble(totalJoints)) * 100));
    }
  }
  return {
    name,
    photo,
    chart: [
      { label: 'Total Joints', value: netInt(ok) },
      { label: 'Total Defects', value: netInt(nok) },
    ],
    rows: [
      ['Operator Name', operatorName],
      ['Operator Code', operatorID],
      ['Total No. Of Joints', totalJoints],
      ['Total OK', ok],
      ['Total Not OK', nok],
      ['Efficiency', `${pct}%`],
    ],
  };
}
