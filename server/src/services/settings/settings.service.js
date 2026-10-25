// Port of Avatar.Settings: key/value rows from the Settings table.
// The original loaded them only after the first successful login (so the first login after an IIS restart
// compared passwords unencrypted). Here they load at startup and reload after every login, as before.
import { query } from '../../db/connection.js';
import { netInt, netString } from '../../shared/utils/net.js';

const values = new Map();

export async function loadSettings(rows) {
  rows ??= await query('select * from Settings');
  values.clear();
  for (const r of rows) {
    const [key, value] = Object.values(r);
    values.set(netString(key), value);
  }
}

/** Integer setting via ParseInt, 0 when absent (the original's field defaults). */
export function setting(name) {
  return values.has(name) ? netInt(values.get(name)) : 0;
}

/** Text setting, or fallback when absent. */
export function settingText(name, fallback = '') {
  return values.has(name) ? netString(values.get(name)) : fallback;
}
