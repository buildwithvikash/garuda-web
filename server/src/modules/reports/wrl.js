// Port of the Avatar.AVReports / AVProductionCapture methods behind View/Reports/WRLReports pages.
// SQL text is the original's; values are parameters. Row-by-row C# logic is kept, including its quirks
// (string-compared formatted dates, "11:59:59" end times, added text columns, ToEven rounding).
import { query, scalar } from "../../db/index.js";
import {
  netString,
  netDouble,
  netLong,
  netInt,
  netNum,
} from "../../lib/net.js";
import {
  sqlTable,
  newTable,
  addColumn,
  removeColumn,
  newRow,
  get,
  set,
  col,
} from "./table.js";

const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n) => String(n).padStart(2, "0");
const dMMMyyyyHms = (d) =>
  `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Math.Round(x, digits) on a double: midpoint to even. */
function round(x, digits) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** digits;
  const v = Number((x * f).toPrecision(15));
  const fl = Math.floor(v);
  const diff = v - fl;
  const r = diff > 0.5 ? fl + 1 : diff < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1;
  return r / f;
}

/** DateTime.Parse for the strings these reports pass around ("23-Apr-2024 08:00:00", "2024-04-23 08:00:00", "23-Apr-2024"). */
function parseDate(s) {
  const t = netString(s).trim();
  const m =
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      t,
    );
  if (m)
    return new Date(
      +m[3],
      MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()),
      +m[1],
      +(m[4] ?? 0),
      +(m[5] ?? 0),
      +(m[6] ?? 0),
    );
  const d = new Date(t.replace(" ", "T"));
  if (Number.isNaN(d.getTime()))
    throw new Error("String was not recognized as a valid DateTime.");
  return d;
}
const dayCol = (d) =>
  `${pad(d.getDate())}-${MON[d.getMonth()]}-${DAY[d.getDay()]}`; // ToString("dd-MMM-ddd")

// Values concatenated straight into the original SQL: an empty value produced invalid SQL there.
function sqlValue(v, error) {
  if (netString(v).trim() === "") throw new Error(error);
  return netString(v);
}

// ---------------------------------------------------------------- simple SQL reports

export async function productionReport(station, department, dtfrom, dtTo) {
  const head =
    "with  Psno as (select DocNo, Material, Serial, VSerial, Alias from MaterialBarcode where PrintStatus=1 and status != 99)   select distinct ROW_NUMBER() OVER (ORDER BY b.StationCode), (select name from Material where MatCode = Psno.Material) as Model_Name, psno.Material as ModelName, b.StationCode,c.Name[Station Name],  CASE WHEN Psno.VSerial is null  THEN Psno.Serial ELSE  Psno.Alias END as [Assembly Sr.No.], isnull(Psno.VSerial, '')[Asset tag], CASE WHEN SUBSTRING(Psno.Serial,1,1) in ('S','F','L') THEN '' ELSE  Psno.Serial END AS [FG SR],  b.ActivityOn[CreatedOn], us.UserName from psno,  ProcessActivity b inner join WorkCenter c on b.StationCode = c.StationCode  inner join Users us on us.UserCode = b.Operator where b.PSNo = psno.DocNo and b.ActivityOn between @dtfrom and @dtTo  and b.ActivityType = 5 and ";
  if (netString(station) === "") {
    sqlValue(department, "Incorrect syntax near ')'.");
    return sqlTable(
      `${head}c.StationCode in (select StationCode from WorkCenter where Department = @department)`,
      { dtfrom, dtTo, department },
    );
  }
  return sqlTable(`${head}c.StationCode = @station`, { dtfrom, dtTo, station });
}

const REWORK_COLS =
  "select  ROW_NUMBER() OVER (ORDER BY w.Name),m.Alias[Model_Name],mc.Name[Category],w.Name[Station],it.Serial[Assembly Sr.No.],pr.StartedOn[Rework IN], pr.CompletedOn[Rework Out],us.UserName [User Name]  ,s.Status[Rework Status],CONCAT(DATEDIFF(day, pr.StartedOn, pr.CompletedOn),   ':',FORMAT((DATEDIFF(minute, pr.StartedOn, pr.CompletedOn)/60)%24,'D2'),    ':',FORMAT(DATEDIFF(minute,pr.StartedOn, pr.CompletedOn) % 60,'D2'))[Duration (DD,HH:MM)] ,dct.Type[Defect Category] ,dc.Name[Defect],rc.Type[Root Cause], rr.Type[Counter Action],it.ApproverRemark [Remark]  ";
const REWORK_TAIL =
  " left join Status s on ih.Status = s.id left join InspectionDefect id on it.ID = id.ID left join DefectCodeMaster dc on id.Defect = dc.Code  left join DefectCategoryType dct on dc.DefectCategory = dct.ID left join RootCause rc on it.RootCause = rc.ID left join ReworkResolution rr on it.ReworkResolution = rr.ID left join Users us on it.ApprovedBy = us.UserCode ";
export async function reworkReport(station, department, dtfrom, dtTo) {
  sqlValue(department, "Incorrect syntax near ')'.");
  const deptProcs =
    "(select distinct wp.ProcessCode from WorkCenterProcesses wp inner join WorkCenter w on wp.StationCode = w.StationCode and w.Department = @department)";
  if (netString(station) === "") {
    return sqlTable(
      `${REWORK_COLS}from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo and it.NextAction = 1  and  it.InspectedOn between @dtfrom and @dtTo  inner join Material m on ih.Material = m.MatCode left join MaterialCategory mc on m.Category = mc.CategoryCode  inner join ProcessRouting pr on ih.DocNo = pr.PSNo and  pr.ProcessCode in${deptProcs} inner join WorkCenter w on pr.StationCode = w.StationCode  inner join WorkCenterProcesses wp on pr.ProcessCode = wp.ProcessCode ${REWORK_TAIL}`,
      { department, dtfrom, dtTo },
    );
  }
  return sqlTable(
    `${REWORK_COLS}from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo and ih.Process in ${deptProcs.replace("w.Department = @department", "w.Department =@department")} and it.NextAction = 1  and  it.InspectedOn between @dtfrom and @dtTo  inner join Material m on ih.Material = m.MatCode left join MaterialCategory mc on m.Category = mc.CategoryCode  inner join ProcessRouting pr on ih.DocNo = pr.PSNo and ih.Process = pr.ProcessCode and pr.StationCode =@station and  pr.ProcessCode in${deptProcs} inner join WorkCenter w on pr.StationCode = w.StationCode and w.StationCode = @station inner join WorkCenterProcesses wp on pr.ProcessCode = wp.ProcessCode and wp.StationCode =@station${REWORK_TAIL}`,
    { department, dtfrom, dtTo, station },
  );
}

export const scrapReport = (dtfrom, dtTo) =>
  sqlTable(
    "select m.Name[Model] ,mc.Name[Category],fs.Serial[Serial Number],format(fs.ScrapDate,'dd-MMM-yyyy')[Scrap Date],format(fs.ScrapDate,'HH:mm:ss')[Scrap Time], fs.Remark[Scrap Reasons] ,sr.Type[Scrap Category],wc.Name [Scrapped From], us.UserName[Scrapped By]  from FGScrap fs inner join MaterialBarcode mb on fs.Serial = mb.Serial  inner join Material m on mb.Material = m.MatCode inner join MaterialCategory mc on m.Category = mc.CategoryCode left join ScrapReasons sr on fs.SCRAPCATEGORY = sr.ID  left join WorkCenter wc on fs.LastStation = wc.StationCode inner join Users us on fs.UserID = us.UserID  where fs.ScrapDate between @dtfrom and @dtTo order by fs.Serial",
    { dtfrom, dtTo },
  );

export const mftReport = (dtfrom, dtTo) =>
  sqlTable(
    "SELECT  ID,PRODUCT_CODE,EQUIPMENT_NO ,PASS_FAILED_TIMES,MFT_NO,STATUS,ERRORCODE,START_TIME,STOP_TIME,REASON, REPORT_PATH,PDFFileName,SYNCSTATUS FROM MFTStaging where cast(START_TIME as datetime) between @dtfrom and @dtTo order by cast(START_TIME as datetime)",
    { dtfrom, dtTo },
  );

export const gasChargingReport = (dtfrom, dtTo) =>
  sqlTable(
    "SELECT [Result_ID],[DATE],[TIME],[BARCODE],[MODEL],[MODELNAME],[RUNTIME_SECONDS],[REFRIGERANT],[SET_GAS_WEIGHT],[ACTUAL_GAS_WEIGHT],[LEAK_SET_VALUE],[LEAK_TEST_VALUE],[LEAK_TEST_TIME],[SET_EVACUATION_VALUE] ,[ACTUAL_EVACUATION_VALUE] ,[ACTUAL_EVACUATION_TIME],[PERFORMANCE] ,[FaultCode] ,[FaultName] ,[SyncStatus] FROM [GasChargeDtls] where  convert(datetime,concat([date],' ' ,[time]), 103) between @dtfrom and @dtTo order by convert(datetime,concat([date],' ' ,[time]), 103)",
    { dtfrom, dtTo },
  );

export const estReport = (dtfrom, dtTo) =>
  sqlTable(
    "Select *  From ESTStaging WHERE date_time between @dtfrom and @dtTo order by date_time",
    { dtfrom, dtTo },
  );

export const jointWiseLeak = (dtfrom, dtto) =>
  sqlTable(
    "Select pt.Description[Joint Leakage Description],pt.Name[Joint No],count(ih.InspectionLotNo)[No Of Leakage]  from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo =it.InspectionLotNo  inner join ProcessRouting pr on pr.PSNo=ih.DocNo and ProcessCode=12206 inner join  ProcessInspectionCheckList chk on chk.PSNo=ih.DocNo and chk.status=0 inner join  ParameterTran pt on pt.ParameterCode=pr.ParameterCode and pr.ProcessCode=12206  and format(it.inspectedon,'dd-MMM=yyyy') between @dtfrom and @dtto group by pt.Description,pt.Name  ",
    { dtfrom, dtto },
  );

/** Two grids: details and summary (dt1). */
export async function stopLossReport(area, dtfrom, dtTo) {
  const details = await sqlTable(
    "SELECT PLCLocation[Station Name],format(EmgOn,'dd-MMM-yyyy')[Date], format(EmgOff,'HH:mm:ss')[Stop Time] ,format(Emgon,'HH:mm:ss')[Start Time],SUBSTRING(cast(TimeDiff as varchar(16)),1,8) [Duration]  FROM EMGTrans where Location = @area and EmgOff between @dtfrom and @dtTo and Status = 1 and Result = 1 and TimeDiff  is not NULL",
    { area, dtfrom, dtTo },
  );
  const summary = await sqlTable(
    "Select PLCLocation [Station Name], cast(((isnull(sum([TotalSec]),0)/60)/60) as varchar(8)) + ':' + right('0' + cast(((isnull(sum([TotalSec]),0)/60) % 60) as varchar(2)), 2) + ':' + right('0' + cast((isnull(sum([TotalSec]),0) %60) as varchar(2)), 2) [Total Stop Time],  count(PLCLocation)[Total Stop Count],''[Remark] from EMGTrans where Location = @area and Emgoff between @dtfrom and @dtTo group by PLCLocation,MEMBit ",
    { area, dtfrom, dtTo },
  );
  return [details, summary];
}

// ---------------------------------------------------------------- reports with C# post-processing

const PROD_COUNT = (dateFrom, dateTo) =>
  `Select COUNT(ih.InspectionLotNo) from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo=it.InspectionLotNo where ih.Process=@process and format(it.InspectedOn,'dd-MMM-yyyy') between ${dateFrom} and ${dateTo}`;

/** AVReports.Rework (Defect Stage Count Report). With no stage the original SQL is invalid ("and and", no SELECT). */
export async function rework(dtfrom, dtto, process) {
  if (netString(process) === "") throw new Error("Incorrect syntax near 'it'.");
  const t = await sqlTable(
    "select mcat.Name[Material Type],sum(it.qty)[Qty] from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo inner join Material m on ih.Material = m.MatCode left join MaterialCategory mcat on m.Category = mcat.CategoryCode where it.NextAction = 1 and ih.process=@process and format(it.InspectedOn,'dd-MMM-yyyy') between @dtfrom and @dtto group by mcat.Name order by sum(it.qty) desc",
    { process, dtfrom, dtto },
  );
  addColumn(t, "ProdQty");
  addColumn(t, "DefectPercentage");
  for (const r of t.rows) {
    const totalProd = netDouble(
      await scalar(PROD_COUNT("@dtfrom", "@dtto"), { process, dtfrom, dtto }),
    );
    set(t, r, "ProdQty", totalProd);
    set(
      t,
      r,
      "DefectPercentage",
      round((netDouble(get(t, r, "Qty")) / totalProd) * 100, 3),
    );
  }
  return t;
}

/** AVReports.LeakCount (DateWise Leakage). */
export async function leakCount(dtfrom, dtto, process) {
  const t = await sqlTable(
    "Select InspectedOn[Date Wise],count(ih.InspectionLotNo)[Total Leak] from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo =it.InspectionLotNo  where ih.Process =12206 and ih.DocNo in (Select  distinct psno from ProcessInspectionCheckList where ProcessCode=12206 and Status=0) and format(it.inspectedon,'dd-MMM=yyyy') between @dtfrom and @dtto group by InspectedOn  ",
    { dtfrom, dtto },
  );
  addColumn(t, "ProdQty");
  addColumn(t, "Actual Percentage");
  for (const r of t.rows) {
    const totalProd = netDouble(
      await scalar(PROD_COUNT("@dtfrom", "@dtto"), { process, dtfrom, dtto }),
    );
    set(t, r, "ProdQty", totalProd);
    set(
      t,
      r,
      "Actual Percentage",
      round((netDouble(get(t, r, "Total Leak")) / totalProd) * 100, 3),
    );
  }
  return t;
}

/** AVReports.DailyDefectTrend. Note the original's day window ends at 11:59:59 for production counts. */
export async function dailyDefectTrend(dtfrom, dtto, process) {
  const ppm = netDouble(
    await scalar("Select top 1 cost from ProductionProcess"),
  );
  const base =
    "select format(it.InspectedOn,'dd-MMM-yyyy')[InspectedOn],  count(it.qty)[Qty] from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo ";
  const range = { s: `${dtfrom} 00:00:01`, e: `${dtto} 23:59:59` };
  const t =
    netString(process) === ""
      ? await sqlTable(
          `${base}where NextAction !=0 and it.InspectedOn between @s and @e group by format(it.InspectedOn,'dd-MMM-yyyy')`,
          range,
        )
      : await sqlTable(
          `${base} where ih.process=@process and NextAction !=0 and it.InspectedOn between @s and @e group by format(it.InspectedOn,'dd-MMM-yyyy')`,
          { ...range, process },
        );
  addColumn(t, "ProdQty");
  addColumn(t, "Target");
  addColumn(t, "DefectPercentage");
  for (const r of t.rows) {
    const day = netString(get(t, r, "InspectedOn"));
    const p = { s: `${day} 00:00:01`, e: `${day} 11:59:59`, process };
    const totalProd = netDouble(
      await scalar(
        netString(process) === ""
          ? "Select COUNT(ih.InspectionLotNo) from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo=it.InspectionLotNo where  it.InspectedOn between @s and @e"
          : "Select COUNT(ih.InspectionLotNo) from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo=it.InspectionLotNo where ih.Process=@process and it.InspectedOn between @s and @e",
        p,
      ),
    );
    set(t, r, "ProdQty", totalProd);
    set(t, r, "Target", ppm);
    set(
      t,
      r,
      "DefectPercentage",
      round((netDouble(get(t, r, "Qty")) / totalProd) * 100, 3),
    );
  }
  return t;
}

/** AVReports.PPMRework (5-argument overload used by the page). */
export async function ppmRework(dtfrom, dtto, process) {
  const ppm = netDouble(
    await scalar("Select top 1 cost from ProductionProcess"),
  );
  const hasP = netString(process) !== "";
  const t = await sqlTable(
    `select ih.Material,m.Category,s.shiftcode,format(it.InspectedOn,'dd-MMM-yyyy') DATE ,S.Name[SHIFT],mcat.Name[Material Type],m.Alias[MatCode],sum(it.qty)[Qty] from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo inner join Material m on ih.Material = m.MatCode left join MaterialCategory mcat on m.Category = mcat.CategoryCode left join Shift S on it.Shift = s.ShiftCode where it.NextAction = 1 ${hasP ? " and ih.process=@process" : ""} and it.InspectedOn between @dtfrom and @dtto group by s.shiftCode,S.Name,mcat.Name,m.Alias,ih.Material,m.Category, format(it.InspectedOn, 'dd-MMM-yyyy') order by sum(it.qty) desc`,
    { dtfrom, dtto, process },
  );
  for (const c of [
    "ModelWiseProduction",
    "ModelWiseDefect",
    "DayWiseProduction",
    "TargetDefect",
    "DayWiseDesfectPercentage",
    "DayWiseDefectPercentage",
  ])
    addColumn(t, c);
  const proc = hasP ? "@process" : "12212";
  for (const r of t.rows) {
    const day = netString(get(t, r, "DATE"));
    const p = {
      s: `${day} 00:00:01`,
      e: `${day} 23:59:59`,
      cat: netLong(get(t, r, "Category")),
      mat: netLong(get(t, r, "Material")),
      process,
    };
    set(
      t,
      r,
      "ModelWiseDefect",
      netDouble(
        await scalar(
          `select sum(it.qty)[Qty] from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo  inner join Material m on ih.Material = m.MatCode left join MaterialCategory mcat on m.Category = mcat.CategoryCode  where it.NextAction = 1 and ih.Process = ${proc} and mcat.CategoryCode = @cat and it.InspectedOn between @s and @e `,
          p,
        ),
      ),
    );
    set(
      t,
      r,
      "ModelWiseProduction",
      netDouble(
        await scalar(
          `select sum(it.qty)[Qty] from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo  inner join Material m on ih.Material = m.MatCode left join MaterialCategory mcat on m.Category = mcat.CategoryCode  where ${hasP ? "ih.process = @process and " : " "}mcat.CategoryCode = @cat and it.InspectedOn between @s and @e `,
          p,
        ),
      ),
    );
    const totalProd = netDouble(
      await scalar(
        ` Select COUNT(ih.InspectionLotNo) from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo = it.InspectionLotNo  where ih.Process = ${proc}  and ih.Material = @mat and it.InspectedOn between @s and @e `,
        p,
      ),
    );
    set(t, r, "DayWiseProduction", totalProd);
    set(t, r, "TargetDefect", ppm);
    set(
      t,
      r,
      "DayWiseDefectPercentage",
      round((netDouble(get(t, r, "Qty")) / totalProd) * 100, 3),
    );
  }
  removeColumn(t, "shiftcode");
  removeColumn(t, "Material");
  removeColumn(t, "Category");
  return t;
}

const NBSP = " ";
const JOINT_ROUTE = `Select rt.ProcessCode from RouteInstruction ri inner join RoutingTrans rt on ri.RouteCode=rt.RouteCode and ri.SeqNo=rt.SeqNo and ri.Instruction=@joint`;

/** AVReports.BrazingReworkSummary (Brazing Report, legacy page). */
export async function brazingReworkSummary(dtfrom, dtto) {
  const t = await sqlTable(
    `select${NBSP}it.InspectedOn,s.Name[SHIFT],mc.Name [Model],it.Serial[Serial No], mb.Serial[FG CODE],pt.Description[Joint Leakage Description] , pt.Name[Joint No],ih.DocNo,pr.ParameterCode,pt.LineCode,pr.RouteCode from InspectionTrans it${NBSP}inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo and ih.Process =12206 and it.InspectedOn between @s and @e left join Shift S on it.Shift = s.ShiftCode left join Material m on ih.Material = m.MatCode left join MaterialCategory mc on m.Category = mc.CategoryCode left join MaterialBarcode mb on it.Barcode = mb.BarcodeNo inner join ProcessRouting pr on pr.PSNo = ih.DocNo and pr.ProcessCode = 12206 and pr.ProcessCode = ih.Process inner join ProcessInspectionCheckList chk on chk.PSNo = ih.DocNo and chk.status = 0 inner join ParameterTran pt on pt.ParameterCode = pr.ParameterCode and pr.ProcessCode = 12206 AND pt.LineCode = chk.LineCode order by it.InspectedOn desc `,
    { s: `${dtfrom} 00:00:01`, e: `${dtto} 11:59:59` },
  );
  addColumn(t, "Brazer");
  for (const r of t.rows) {
    if (netString(get(t, r, "Serial No")) === netString(get(t, r, "FG CODE")))
      set(t, r, "FG CODE", "");
    const pro = netString(
      await scalar(JOINT_ROUTE, { joint: netString(get(t, r, "Joint No")) }),
    );
    if (pro !== "") {
      set(
        t,
        r,
        "Brazer",
        netString(
          await scalar(
            "Select top 1 u.UserName from ProcessActivity pa inner join Users u on pa.Operator=u.UserCode  where PSNO=@ps and ProcessCode=@pro and ActivityType=1 ",
            { ps: netLong(get(t, r, "DocNo")), pro },
          ),
        ),
      );
    }
  }
  for (const c of ["DocNo", "ParameterCode", "LineCode", "RouteCode"])
    removeColumn(t, c);
  return t;
}

/** AVReports.BrazerSummary: the grid shows dt3 (per brazer and joint); Excel exported the first table, as the original. */
export async function brazerSummary(dtfrom, dtto) {
  const p = { s: `${dtfrom} 00:00:01`, e: `${dtto} 23:59:59` };
  const q = (status) =>
    `select${NBSP}pt.Description[JointDescription] , pt.Name[Joint No],ih.DocNo,pr.ParameterCode,pt.LineCode,pr.RouteCode from InspectionTrans it${NBSP}inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo and ih.Process =12206 and it.InspectedOn between @s and @e inner join ProcessRouting pr on pr.PSNo = ih.DocNo and pr.ProcessCode = 12206 and pr.ProcessCode = ih.Process inner join ProcessInspectionCheckList chk on chk.PSNo = ih.DocNo and chk.status = ${status} inner join ParameterTran pt on pt.ParameterCode = pr.ParameterCode and pr.ProcessCode = 12206 AND pt.LineCode = chk.LineCode order by it.InspectedOn `;
  const withBrazer = async (t) => {
    addColumn(t, "Brazer");
    for (const r of t.rows) {
      const pro = netString(
        await scalar(JOINT_ROUTE, { joint: netString(get(t, r, "Joint No")) }),
      );
      if (pro !== "")
        set(
          t,
          r,
          "Brazer",
          netString(
            await scalar(
              "Select Operator from ProcessActivity  where PSNO=@ps and ProcessCode=@pro and ActivityType=1 ",
              { ps: netLong(get(t, r, "DocNo")), pro },
            ),
          ),
        );
    }
    return t;
  };
  const dt = await withBrazer(await sqlTable(q(0), p));
  const dt2 = await withBrazer(await sqlTable(q(1), p));
  const dt3 = newTable(["Brazer", "Joint", "Total Leak", "Total Brazed"]);
  const users = await query("Select UserCode,UserName from Users");
  const joints = await query(
    `select${NBSP}distinct pt.Description[JointDescription], pt.Name[Joint No] from InspectionTrans it${NBSP}inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo and ih.Process =12206 and it.InspectedOn between @s and @e inner join ProcessRouting pr on pr.PSNo = ih.DocNo and pr.ProcessCode = 12206 and pr.ProcessCode = ih.Process inner join ProcessInspectionCheckList chk on chk.PSNo = ih.DocNo  inner join ParameterTran pt on pt.ParameterCode = pr.ParameterCode and pr.ProcessCode = 12206 AND pt.LineCode = chk.LineCode`,
    p,
  );
  const count = (t, jd, uc) =>
    t.rows.filter(
      (r) =>
        netString(get(t, r, "JointDescription")) === jd &&
        netString(get(t, r, "Brazer")) === uc,
    ).length;
  for (const u of users) {
    for (const j of joints) {
      const jd = netString(j.JointDescription);
      const sc = count(dt2, jd, netString(u.UserCode));
      const fc = count(dt, jd, netString(u.UserCode));
      if (sc > 0 || fc > 0) {
        const row = newRow(dt3);
        set(dt3, row, "Brazer", u.UserName);
        set(dt3, row, "Joint", j.JointDescription);
        set(dt3, row, "Total Leak", fc);
        set(dt3, row, "Total Brazed", sc);
        dt3.rows.push(row);
      }
    }
  }
  return { grid: dt3, excel: dt };
}

/** AVReports.BrazingNewReport (Brazing Report in the menu). */
export async function brazingNewReport(dtfrom, dtTo) {
  const t = await sqlTable(
    "with Brazingdata as (select distinct us.UserName[Brazer_Name], pp.Name[Station],pt.Name[Joint_Name],pt.Description[Joint_Description],format(it.InspectedOn,'dd-MMM-yyyy')[Date],FORMAT(it.InspectedOn,'MMM')[Month],ri.SeqNo, ih.DocNo, pt.LineCode, pr.RouteCode, iud.Status[status], pr.ProcessCode,  wp.StationCode, pl.UserCode, it.InspectionLotNo, it.ID   from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo  and ih.Process IN (12206, 12402, 12401)  and it.InspectedOn between @dtfrom and @dtTo  inner join ProcessRouting pr on pr.PSNo = ih.DocNo and pr.ProcessCode IN (12206, 12402, 12401) and pr.ProcessCode = ih.Process  left join InspectionUD iud on it.ID = iud.ID  left join ParameterTran pt on pt.ParameterCode = pr.ParameterCode and pr.ProcessCode IN (12206, 12402, 12401) AND pt.LineCode = iud.LineCode  inner join RouteInstruction ri on pr.RouteCode = ri.RouteCode and pt.Name = ri.Instruction  inner join RoutingTrans rt on rt.SeqNo = ri.SeqNo and ri.RouteCode = pr.RouteCode  inner join ProductionProcess pp on pp.ProcessCode = rt.ProcessCode  inner join WorkCenterProcesses wp on wp.ProcessCode = rt.ProcessCode  inner join ProcessUserLogin pl on wp.StationCode = pl.Station and pl.Status = 1  left join Users us on pl.UserCode = us.UserCode) select [Brazer_Name],[Joint_Name],[Joint_Description],[Station],[Date],[Month] ,  isnull(sum(case when status =0 then 1 end),0) as [Leakage_Count],(count(distinct  DocNo) * count(distinct[Joint_Name])) [Total_Joint_Brazed] from Brazingdata   group by [Date],[Station],[Brazer_Name],[Joint_Name],[Joint_Description],[Month] ORDER BY [Date],[Station],[Brazer_Name] ",
    { dtfrom, dtTo },
  );
  addColumn(t, "Total_FG_PRD");
  const fg = await query(
    "select Count(distinct PSNo)[Total] ,format(CompletedOn,'dd-MMM-yyyy') [FGDATE]  from ProcessRouting where StationCode =1220010 and Status=2  and CompletedOn between @dtfrom and @dtTo group  by format(CompletedOn,'dd-MMM-yyyy')",
    { dtfrom, dtTo },
  );
  for (const d of fg)
    for (const r of t.rows)
      if (netString(d.FGDATE) === netString(get(t, r, "Date")))
        set(t, r, "Total_FG_PRD", d.Total);
  return t;
}

/** AVReports.HourlyCountReport (Hourly Report). */
export async function hourlyCountReport(startDate, endDate, station) {
  sqlValue(station, "Incorrect syntax near the keyword 'and'.");
  const t = newTable(["TIME", "MTD_Avg_UPH"]);
  const eD = parseDate(endDate);
  for (let sD = parseDate(startDate); ; ) {
    t.columns.push({ name: dayCol(sD), type: "nvarchar", scale: 0 });
    sD = new Date(
      sD.getFullYear(),
      sD.getMonth(),
      sD.getDate() + 1,
      sD.getHours(),
      sD.getMinutes(),
      sD.getSeconds(),
    );
    if (!(sD <= eD)) break;
  }
  const data = await query(
    "Select  ( FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn), 0),'HH:mm')  +'-' + FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn) +1, 0),'HH:mm') )as [TIME],FORMAT (CompletedOn, 'dd-MMM-yyyy')[DATE]  , Count(distinct PSNo)[Qty] from ProcessRouting where StationCode = @station and Status = 2 and CompletedOn between @startDate and @endDate  GROUP BY(FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn), 0), 'HH:mm') + '-' + FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn) + 1, 0), 'HH:mm')), FORMAT(CompletedOn, 'dd-MMM-yyyy')  ORDER BY(FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn), 0), 'HH:mm') + '-' + FORMAT(dateadd(hour, datediff(hour, 0, CompletedOn) + 1, 0), 'HH:mm')), FORMAT(CompletedOn, 'dd-MMM-yyyy')",
    { station, startDate, endDate },
  );
  const times = [];
  for (const d of data)
    if (netString(d.TIME) !== (times.at(-1) ?? ""))
      times.push(netString(d.TIME));
  let tQty = 0;
  for (const time of times) {
    const row = newRow(t);
    set(t, row, "TIME", time);
    let qty = 0;
    let n = 0;
    for (const d of data.filter((x) => netString(x.TIME) === time)) {
      qty += netDouble(d.Qty);
      const name = dayCol(parseDate(d.DATE));
      if (t.columns.some((c) => c.name === name)) {
        n++;
        set(t, row, name, netDouble(d.Qty));
      }
    }
    const mtd = round(qty / n, 2);
    set(t, row, "MTD_Avg_UPH", mtd);
    tQty += mtd;
    t.rows.push(row);
  }
  const total = newRow(t);
  set(t, total, "TIME", "Grand Total :");
  set(t, total, "MTD_Avg_UPH", tQty);
  t.rows.push(total);
  return t;
}

/** AVReports.FGProductionReport (Production Count Report). */
export async function fgProductionReport(startDate, endDate, station) {
  sqlValue(station, "Incorrect syntax near the keyword 'and'.");
  const t = newTable(["Type", "Models", "Total_Prodcued"]);
  const eD = parseDate(endDate);
  for (let sD = parseDate(startDate); ; ) {
    t.columns.push({ name: dayCol(sD), type: "nvarchar", scale: 0 });
    sD = new Date(
      sD.getFullYear(),
      sD.getMonth(),
      sD.getDate() + 1,
      sD.getHours(),
      sD.getMinutes(),
      sD.getSeconds(),
    );
    if (!(sD <= eD)) break;
  }
  const data = await query(
    "Select  mc.Name[Type] ,m.Name, FORMAT (pr.CompletedOn, 'dd-MMM-yyyy')[ProducedOn],count(Distinct pr.PSNo)[Qty]  from ProcessRouting pr inner join ProcessOrder po on pr.PSNo = po.PSNo  inner join Material m on po.Material = m.MatCode  left join MaterialCategory mc on m.Category = mc.CategoryCode  where pr.Status = 2 and pr.StationCode = @station and CompletedOn between @startDate and @endDate  group by  mc.Name, m.Name, FORMAT(pr.CompletedOn, 'dd-MMM-yyyy') order by mc.Name, m.Name, FORMAT(pr.CompletedOn, 'dd-MMM-yyyy')",
    { station, startDate, endDate },
  );
  const models = [];
  for (const d of data)
    if (netString(d.Name) !== (models.at(-1)?.name ?? ""))
      models.push({ name: netString(d.Name), type: d.Type });
  let tQty = 0;
  for (const m of models) {
    const row = newRow(t);
    set(t, row, "Type", m.type);
    set(t, row, "Models", m.name);
    let qty = 0;
    for (const d of data.filter((x) => netString(x.Name) === m.name)) {
      qty += netDouble(d.Qty);
      const name = dayCol(parseDate(d.ProducedOn));
      if (t.columns.some((c) => c.name === name))
        set(t, row, name, netDouble(d.Qty));
    }
    set(t, row, "Total_Prodcued", qty);
    tQty += qty;
    t.rows.push(row);
  }
  const total = newRow(t);
  set(t, total, "Models", "Grand Total :");
  set(t, total, "Total_Prodcued", tQty);
  t.rows.push(total);
  return t;
}

/** AVProductionCapture.FillFGReport (FG Report). */
export async function fillFGReport(from, to) {
  const t = newTable([
    "Date",
    "Customer",
    "Model",
    "Country",
    "Color",
    "Graphics",
    "From_SR",
    "To_SR",
    "Qty",
    "BEE",
  ]);
  const rows = await query(
    "Select mb.Material,MB.ParentBarcode[BEE],COUNT(mb.BarcodeNo)[Qty],min(mb.serial)[MinSL],max(mb.Serial)[MaxSL],format(pr.CompletedOn,'dd-MMM-yyyy')[Date] from ProcessRouting pr  inner join MaterialBarcode mb on pr.PSNo = mb.DocNo  and mb.QCStatus = 12 and pr.ProcessCode = 12212 and mb.VSerial is not null  where pr.CompletedOn between @from and @to group by  mb.Material,mb.ParentBarcode ,format(pr.CompletedOn,'dd-MMM-yyyy') order by mb.Material,format(pr.CompletedOn,'dd-MMM-yyyy') ",
    { from, to },
  );
  for (const d of rows) {
    const row = newRow(t);
    set(t, row, "Date", netString(d.Date));
    set(t, row, "From_SR", netString(d.MinSL));
    set(t, row, "To_SR", netString(d.MaxSL));
    set(t, row, "Qty", netString(d.Qty));
    set(t, row, "BEE", netString(d.BEE));
    const m = await query(
      "select m.Name[Model],vf.Name[Variant],vfv.Name[Value] from Material m left join MaterialVariant mv on m.MatCode=mv.MatCode and m.MatCode=@mat   left join VariantFieldValue vfv on mv.ValueCode =vfv.Code inner join VariantField vf on vfv.Field=vf.FieldCode  ",
      { mat: netString(d.Material) },
    );
    if (m.length) {
      set(t, row, "Model", netString(m[0].Model));
      for (const v of m) {
        const k = netString(v.Variant).toUpperCase();
        if (k.includes("COUNTRY")) set(t, row, "Country", netString(v.Value));
        else if (k.includes("CUSTOMER"))
          set(t, row, "Customer", netString(v.Value));
        else if (k.includes("COLOR")) set(t, row, "Color", netString(v.Value));
        else if (k.includes("GRAPHICS"))
          set(t, row, "Graphics", netString(v.Value));
      }
    }
    t.rows.push(row);
  }
  return t;
}

// ---------------------------------------------------------------- process history (by serial)

async function psNoAndModel(serial) {
  const psNo = netString(
    await scalar(
      "Select top 1 docNo from MaterialBarcode where serial=@serial or Alias=@serial",
      { serial },
    ),
  );
  if (psNo === "") throw new Error("Invalid Serial Number");
  const model = netString(
    await scalar(
      "Select Name from Material where matcode=(select Material from ProcessOrder Where Psno=@psNo)",
      { psNo },
    ),
  );
  return { psNo, model };
}

/** AVReports.ProcessHistory. */
export async function processHistory(serial) {
  const { psNo, model } = await psNoAndModel(serial);
  const t = newTable([
    "SrNo",
    "Date",
    "Activity",
    "Check",
    "Method",
    "Oprator",
    "Result",
    "ProcessCode",
  ]);
  const route = await query(
    "Select rt.SeqNo,rt.ProcessCode,pp.Name[Activity],pp.CheckPoints,pp.CheckingMethod from RoutingTrans rt inner join ProductionProcess pp on pp.ProcessCode=rt.ProcessCode where rt.RouteCode=(select Routing  from ProcessOrder where psNo=@psNo) order by rt.SeqNo ",
    { psNo },
  );
  route.forEach((r, i) => {
    const row = newRow(t);
    set(t, row, "SrNo", i + 1);
    set(t, row, "Activity", r.Activity);
    set(t, row, "Check", r.CheckPoints);
    set(t, row, "Method", r.CheckingMethod);
    set(t, row, "ProcessCode", r.ProcessCode);
    t.rows.push(row);
  });
  const acts = await query(
    "Select pa.ActivityOn,u.UserName,pa.ProcessCode from ProcessActivity pa inner join ProductionProcess pp on pa.ProcessCode=pp.ProcessCode and pa.ActivityType=5 inner join Users u on pa.Operator=u.UserCode where pa.PSNo=@psNo",
    { psNo },
  );
  for (const row of t.rows) {
    const a = acts.find(
      (x) => netString(x.ProcessCode) === netString(get(t, row, "ProcessCode")),
    );
    if (a) {
      set(t, row, "Date", dMMMyyyyHms(a.ActivityOn));
      set(t, row, "Oprator", netString(a.UserName));
      set(t, row, "Result", "OK");
    }
  }
  return { table: t, model };
}

/** AVReports.ProcessHistoryDefectNew (Process History Card). Kept exactly, including dtIssue.Rows[j]. */
export async function processHistoryDefectNew(serial) {
  const { psNo, model } = await psNoAndModel(serial);
  const t = newTable([
    "SrNo",
    "Date",
    "Activity",
    "Process_Status",
    "Check",
    "Method",
    "ProcessCode",
    "Issue",
    "ActionDateTime",
    "Action",
    "Oprator",
    "Result",
  ]);
  let issue = "";
  const route = await query(
    "select distinct pr.SeqNo,pr.ProcessCode,pp.Name[Activity],pp.CheckPoints,pp.CheckingMethod, pr.CompletedOn[Date and Time] from MaterialBarcode mb inner join ProcessRouting pr on pr.PSNo = mb.DocNo and pr.PSNo = @psNo inner join ProductionProcess pp on pr.ProcessCode = pp.ProcessCode order by pr.SeqNo  ",
    { psNo },
  );
  let i = 1;
  const base = (r, status) => {
    const row = newRow(t);
    set(t, row, "Activity", r.Activity);
    set(t, row, "Process_Status", status);
    set(t, row, "Check", r.CheckPoints);
    set(t, row, "Method", r.CheckingMethod);
    set(t, row, "ProcessCode", r.ProcessCode);
    return row;
  };
  const noRow = (j) => new Error(`There is no row at position ${j}.`);
  for (const r of route) {
    const data = await query(
      "Select pa.ActivityOn,u.UserName,pa.ProcessCode,pa.ActivityType from ProcessActivity pa inner join ProductionProcess pp on pa.ProcessCode=pp.ProcessCode and pa.ActivityType in(1,5) left join Users u on pa.Operator=u.UserCode where pa.PSNo=@psNo and pa.ProcessCode = @pc order by pa.ROWID",
      { psNo, pc: r.ProcessCode },
    );
    if (!data.length) {
      const row = base(r, "Not Started");
      set(t, row, "SrNo", i++);
      t.rows.push(row);
      continue;
    }
    for (let j = 0; j < data.length; j++) {
      const d = data[j];
      const row = base(r, "Start");
      set(t, row, "Date", dMMMyyyyHms(d.ActivityOn));
      if (netString(d.ActivityType) === "1") {
        set(t, row, "SrNo", i++);
        const iss = await query(
          "select dfm.Name[Issue],rr.Type [Action],it.ApprovedOn[ApprovedOn],it.InspectedOn from InspectionTrans it inner join InspectionHeader ih on ih.InspectionLotNo = it.InspectionLotNo and it.NextAction =1 and ih.DocNo = @psNo  and ih.Process =@pc inner join InspectionDefect id on it.ID = id.ID  left join DefectCodeMaster dfm on id.Defect = dfm.Code  left join ReworkResolution rr on it.ReworkResolution = rr.ID",
          { psNo, pc: r.ProcessCode },
        );
        if (iss.length) {
          if (netString(iss[0].Issue) === "") continue;
          set(t, row, "SrNo", i++);
          issue =
            iss.length === 1
              ? netString(iss[0].Issue)
              : iss.map((x) => netString(x.Issue)).join("\r\n");
          set(t, row, "Issue", issue);
          set(t, row, "Result", "Fail");
          set(t, row, "Oprator", netString(d.UserName));
          t.rows.push(row);
          const row2 = base(r, "Rework");
          set(t, row2, "SrNo", i++);
          if (j >= iss.length) throw noRow(j); // original indexes dtIssue with the activity index j
          if (!(iss[j].InspectedOn instanceof Date))
            throw new Error("String was not recognized as a valid DateTime.");
          set(t, row2, "Date", dMMMyyyyHms(iss[j].InspectedOn));
          // DateTime.Parse(dtIssue.Rows[j]["ApprovedOn"]) first, then the value from row 0 — both must be dates.
          if (
            !(iss[j].ApprovedOn instanceof Date) ||
            !(iss[0].ApprovedOn instanceof Date)
          )
            throw new Error("String was not recognized as a valid DateTime.");
          set(t, row2, "ActionDateTime", dMMMyyyyHms(iss[0].ApprovedOn));
          set(t, row2, "Action", netString(iss[0].Action));
          set(t, row2, "Issue", issue);
          set(t, row2, "Result", "OK");
          set(t, row2, "Oprator", netString(d.UserName));
          t.rows.push(row2);
        } else {
          set(t, row, "Oprator", netString(d.UserName));
          set(t, row, "Result", "OK");
          t.rows.push(row);
        }
      } else {
        set(t, row, "SrNo", i++);
        set(t, row, "Process_Status", "Completed");
        set(t, row, "Oprator", netString(d.UserName));
        set(t, row, "Result", "OK");
        t.rows.push(row);
      }
    }
  }
  return { table: t, model };
}

export { col };
