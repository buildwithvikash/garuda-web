// View/Reports/WRLReports pages with their own code-behind: filters shown, defaults (DateTime.Now.ToString("s")),
// and how BtnRefresh_Click formatted inputs before calling the report method.
import * as r from './wrl.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** DateTime.Parse(text).ToString(format) for the formats these pages use. */
export function fmt(text, format) {
  const d = new Date(String(text));
  if (Number.isNaN(d.getTime())) throw new Error('String was not recognized as a valid DateTime.');
  const p = { yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1), MMM: MON[d.getMonth()], dd: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return {
    'dd-MMM-yyyy': `${p.dd}-${p.MMM}-${p.yyyy}`,
    'dd-MMM-yyyy HH:mm:ss': `${p.dd}-${p.MMM}-${p.yyyy} ${p.HH}:${p.mm}:${p.ss}`,
    'yyyy-MM-dd HH:mm:ss': `${p.yyyy}-${p.MM}-${p.dd} ${p.HH}:${p.mm}:${p.ss}`,
  }[format];
}

const range = (format) => (i) => [fmt(i.from, format), fmt(i.to, format)];
const DMY = 'dd-MMM-yyyy';
const DMYT = 'dd-MMM-yyyy HH:mm:ss';
const YMDT = 'yyyy-MM-dd HH:mm:ss';
const one = (t) => ({ tables: [t] });

export const WRL_REPORTS = {
  brazerwisereport: { title: 'Brazer Wise Report', filters: ['range'], run: async (i) => {
    const { grid, excel } = await r.brazerSummary(...range(DMY)(i));
    return { tables: [grid], excel };
  } },
  brazingnewreport: { title: 'Brazing Report', filters: ['range'], run: async (i) => one(await r.brazingNewReport(...range(DMYT)(i))) },
  brazingreport: { title: 'Brazing Report', filters: ['range'], run: async (i) => one(await r.brazingReworkSummary(...range(DMY)(i))) },
  dailytrenddefect: { title: 'Daily Trend Defect', filters: ['range', 'stage'], run: async (i) => one(await r.dailyDefectTrend(...range(DMY)(i), i.stage)) },
  datewiseleakage: { title: 'DateWise Leakage', filters: ['range'], run: async (i) => one(await r.leakCount(...range(DMY)(i), '12206')) },
  defectstagecountreport: { title: 'Defect Stage Count Report', filters: ['range', 'stage'], run: async (i) => one(await r.rework(...range(DMY)(i), i.stage)) },
  estreportnew: { title: 'EST Staging Report', filters: ['range'], run: async (i) => one(await r.estReport(...range(YMDT)(i))) },
  fgproductionreport: { title: 'FG Production Report', filters: ['range', 'department', 'station'], run: async (i) => one(await r.fgProductionReport(...range(DMYT)(i), i.station)) },
  fgreport: { title: 'FG Report', filters: ['range'], run: async (i) => one(await r.fillFGReport(...range(DMYT)(i))) },
  gaschargingreport: { title: 'GasCharging Report', filters: ['range'], run: async (i) => one(await r.gasChargingReport(...range(YMDT)(i))) },
  jointwiseleakage: { title: 'Joint Wise Leakage', filters: ['range'], run: async (i) => one(await r.jointWiseLeak(...range(DMY)(i))) },
  mftstaging: { title: 'MFT Report', filters: ['range'], run: async (i) => one(await r.mftReport(...range(DMYT)(i))) },
  ppmrework: { title: 'PPM Rework Report', filters: ['range', 'stage'], run: async (i) => one(await r.ppmRework(...range(DMYT)(i), i.stage)) },
  processhistorydefectreport: { title: 'Process History Report', filters: ['serial'], run: async (i) => {
    const { table, model } = await r.processHistoryDefectNew(String(i.serial ?? '').trim());
    return { tables: [table], model };
  } },
  processhistoryreport: { title: 'Process History Report', filters: ['serial'], run: async (i) => {
    const { table, model } = await r.processHistory(String(i.serial ?? '').trim());
    return { tables: [table], model };
  } },
  productionhourlycount: { title: 'Hourly Report', filters: ['range', 'department', 'station'], run: async (i) => one(await r.hourlyCountReport(...range(DMYT)(i), i.station)) },
  productionreport: { title: 'Production Report', filters: ['range', 'department', 'station'], run: async (i) => one(await r.productionReport(i.station, i.department, ...range(YMDT)(i))) },
  reworkreport: { title: 'Rework Report', filters: ['range', 'department', 'station'], run: async (i) => one(await r.reworkReport(i.station, i.department, ...range(DMYT)(i))) },
  scrapreport: { title: 'Scrap Report', filters: ['range'], run: async (i) => one(await r.scrapReport(...range(DMYT)(i))) },
  stoplossreport: { title: 'Stop Loss Report', filters: ['range', 'area'], run: async (i) => {
    const [details, summary] = await r.stopLossReport(String(i.area ?? '').trim(), ...range(DMYT)(i));
    return { tables: [details, summary], excel: details };
  } },
};
