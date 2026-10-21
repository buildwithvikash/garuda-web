// Port of Settings.GetCurrentShift / GetCurrentShiftandPeriod. Timestamps are the same strings the original
// builds ("dd-MMM-yyyy HH:mm:ss" start, "yyyy-MM-dd HH:mm:ss" end) because they are reused inside SQL.
import { query, scalar } from '../../db/index.js';
import { netInt } from '../../lib/net.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const hms = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const ddMMMyyyy = (d) => `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
const yyyyMMdd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());

const NOW = 'CONVERT (TIME, CURRENT_TIMESTAMP)';
const OVERNIGHT = `select top 1 ShiftCode from Shift where (starttime>Endtime) and ((Starttime<${NOW} and Endtime<=${NOW}) or (Starttime>${NOW} and Endtime>=${NOW}))`;

export async function currentShiftCode(depart) {
  let shift;
  if (depart > 0) {
    shift = netInt(await scalar(`select top 1 ShiftCode from Shift where Starttime<${NOW} and Endtime>=${NOW} and Department =@depart`, { depart }));
  } else {
    shift = netInt(await scalar(`select top 1 ShiftCode from Shift where Starttime<${NOW} and Endtime>=${NOW}`));
  }
  if (shift === 0) shift = netInt(await scalar(OVERNIGHT));
  return shift;
}

/** { ShiftCode, ShiftName, STimeStamp, ETimeStamp } or null when no shift matches (original: empty table). */
export async function currentShiftAndPeriod(depart, now = new Date()) {
  const code = await currentShiftCode(depart);
  const rows = await query('select * from shift where  ShiftCode=@code', { code });
  if (!rows.length) return null;
  const { StartTime: st, EndTime: et } = rows[0];
  let tod = now;
  let toe = now;
  if (st.getHours() > et.getHours()) {
    if (now.getHours() > 0 && now.getHours() <= et.getHours()) tod = addDays(now, -1);
    toe = addDays(tod, 1);
  }
  return {
    ShiftCode: rows[0].ShiftCode,
    ShiftName: rows[0].Name,
    STimeStamp: `${ddMMMyyyy(tod)} ${hms(st)}`,
    ETimeStamp: `${yyyyMMdd(toe)} ${hms(et)}`,
  };
}

/** Header fields every WRL dashboard shows (LblShift, LBLDate, LblShiftTime). */
export function shiftHeader(shift, now = new Date()) {
  if (!shift) return { shift: 'Not Defined', date: `${pad(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`, duration: '' };
  const [d] = shift.STimeStamp.split(' ');
  const [dd, mmm, yyyy] = d.split('-');
  return {
    shift: shift.ShiftName,
    date: `${dd} ${mmm} ${yyyy}`,
    duration: `${shift.STimeStamp.split(' ')[1]} To ${shift.ETimeStamp.split(' ')[1]}`,
  };
}
