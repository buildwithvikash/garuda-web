// Port of ControlA.CollectData + Yojak.DataWrapper InsertData / UpdateData / CancelData / GenerateKey / LogEvent
// for forms built with the engine. Statements and values follow the original; everything is parameterized and runs
// in one transaction like the original.
import { query, scalar, execute, transaction } from '../../db/index.js';
import { netString } from '../../lib/net.js';
import { decryptPassword } from '../../lib/password.js';
import { config } from '../../config.js';
import { formTables } from './schema.js';
import { engineControls } from './state.js';
import { toText } from './values.js';
import { roleTree, treeRows, parseDate } from './children.js';
import { enInDateTime } from '../../lib/format.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const dMMMyyyy = (d) => `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`;
const longTime = (d) => `${pad(d.getHours() % 12 || 12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; // en-IN hh:mm:ss tt

/** long.Parse(x.ToString()) */
function longParse(v) {
  const s = v === undefined || v === null ? '' : toText(v);
  if (!/^\s*[+-]?\d+\s*$/.test(s)) throw new Error('Input string was not in a correct format.');
  return BigInt(s.trim());
}
const dataText = (v) => (v === undefined || v === null ? '' : toText(v));

/** ControlA.CollectData: form values (by control ID) -> { tables: [{ schema, rows: [Map] }] } (main/non-grid tables). */
export async function collect(spec, values, ctx, { encryptPass = 0 } = {}) {
  const tables = await formTables(spec);
  const controls = engineControls(spec);
  const out = [];
  const same = (a, b) => a.toLowerCase().trim() === b.toLowerCase().trim();
  for (const t of tables) {
    // Role tree (TreeView Tag[0] = table)
    const tree = controls.find((c) => c.type === 'TreeView' && same(c.tag[0], t.name) && c.tag[2].toLowerCase().trim() !== 'e');
    if (tree) {
      const rows = treeRows(await roleTree(), values[tree.id]).map((r) => new Map(Object.entries(r).map(([k, v]) => [t.col(k)?.name ?? k, v])));
      out.push({ schema: t, prefix: tree.tag[2], rows });
      continue;
    }
    // GridView (Tag[1] = table): BoundField / TemplateField cells; no rows -> no prefix, as the original
    const grid = controls.find((c) => c.type === 'GridView' && same(c.tag[1], t.name) && c.tag[2].toLowerCase().trim() !== 'e');
    if (grid) {
      const given = Array.isArray(values[grid.id]) ? values[grid.id] : [];
      if (!given.length) {
        out.push({ schema: t, prefix: '', rows: [] });
        continue;
      }
      const rows = given.map((g) => {
        const r = new Map();
        for (const f of grid.columns) {
          if (f.kind === 'boundfield') {
            const col = t.col(f.dataField ?? '');
            if (!col) continue;
            // the original read the HTML-encoded cell text; raw text is saved here (no "&amp;" corruption)
            const text = netString(g[f.dataField] ?? g[col.name]).trim().replaceAll('&nbsp;', '');
            if (text === '') continue; // DBNull
            if (col.dotnet === 'Boolean') r.set(col.name, text === '1' ? true : text === '0' ? false : text);
            else r.set(col.name, netString(g[f.dataField] ?? g[col.name]));
          } else if (f.kind === 'templatefield') {
            const name = t.col(f.header.replaceAll(' ', '')) ? f.header.replaceAll(' ', '') : f.footer.replaceAll(' ', '').replace('tb', '');
            const col = t.col(name);
            if (!col) continue;
            const text = netString(g[name] ?? g[col.name]);
            if (text !== '') r.set(col.name, text);
          }
        }
        return r;
      });
      const base = grid.tag[2].includes('.') ? grid.tag[2].split('.')[1] : grid.tag[2];
      const key = (grid.attrs.datakeynames ?? '').split(',')[0].trim();
      out.push({ schema: t, prefix: key ? `${base}.${key}` : base, rows });
      continue;
    }
    // CheckBoxList (Tag[0] = table): one row per checked item, FK column (Tag[2]) = 0 until saved
    const cbl = controls.find((c) => c.type === 'CheckBoxList' && same(c.tag[0], t.name) && c.tag[2].toLowerCase().trim() !== 'e');
    if (cbl) {
      const cond = cbl.tag[2].replaceAll('$', '');
      const picked = Array.isArray(values[cbl.id]) ? values[cbl.id] : [];
      const rows = picked.map((v) => new Map([[t.col(cond)?.name ?? cond, 0], [t.col(cbl.tag[1])?.name ?? cbl.tag[1], netString(v)]]));
      out.push({ schema: t, prefix: cond, rows });
      continue;
    }
    const row = new Map();
    let found = false;
    for (const c of controls) {
      if (c.table.toLowerCase().trim() !== t.name.toLowerCase()) continue;
      const col = t.col(c.column);
      if (!col) continue;
      if (c.type === 'ComboBox') {
        // the picked item's value, when there is one (cb.SelectedValue != "")
        if (netString(values[c.id]) !== '') row.set(col.name, netString(values[c.id]));
        continue;
      }
      if (c.type === 'Image') {
        // UploadImage / CaptureImage: binary column <- base64 of TBImage; text column <- the text unless blank
        found = true;
        const text = netString(values[c.id]);
        if (col.type === 'byte') row.set(col.name, Buffer.from(text.replace('data:image/png;base64,', '').replace('data:image/jpg;base64,', ''), 'base64'));
        else if (text.trim() !== '') row.set(col.name, text.trim());
        continue;
      }
      if (!['TextBox', 'DropDownList', 'CheckBox'].includes(c.type)) {
        if (c.type !== 'Label' && c.type !== 'CheckBoxList' && c.type !== 'Panel' && c.type !== 'Button' && c.type !== 'GridView') found = true;
        continue;
      }
      if (c.type === 'Label') continue;
      found = true;
      const cond = c.cond.replaceAll('$', '');
      const v = values[c.id];
      if (c.type === 'TextBox') {
        let text = netString(v);
        if (cond.toLowerCase() === 'user') text = netString(ctx.userCode);
        if (text.trim() === '') {
          if (col.type === 'integer' || col.type === 'decimal') row.set(col.name, 0);
          else if (col.type === 'datetime' || col.type === 'date') row.set(col.name, new Date(1900, 0, 1));
          else row.set(col.name, ' ');
        } else if (cond === 'CD') {
          const n = new Date();
          n.setMilliseconds(0);
          // "dd-MMM-yyyy HH:mm:ss" into the row: a DateTime column parses it back (the EventLog then prints a DateTime)
          row.set(col.name, col.type === 'datetime' || col.type === 'date' ? n : `${dMMMyyyy(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`);
        } else if (col.type === 'byte') {
          row.set(col.name, Buffer.from(text.replace('data:image/png;base64,', '').replace('data:image/jpg;base64,', ''), 'base64'));
        } else if (cond === 'ENCRYPT') {
          if (encryptPass === 1) row.set(col.name, decryptPassword(text.trim().replaceAll(' ', '+'), config.passwordKey));
        } else if (col.type === 'datetime' || col.type === 'date') {
          // DataRow assignment parses the text (server culture en-IN: dd-MM-yyyy); the row then holds a DateTime,
          // which is also what the EventLog prints ("19-10-2026 12:00:00 AM")
          row.set(col.name, parseDate(text.trim()));
        } else row.set(col.name, text.trim());
      } else if (c.type === 'DropDownList') {
        const sel = v === undefined || v === null ? null : netString(v);
        if (sel !== null && sel !== '') {
          if (col.type === 'boolean') {
            if (sel === '1') row.set(col.name, true);
            else if (sel === '0') row.set(col.name, false);
            else if (/^(true|false)$/i.test(sel.trim())) row.set(col.name, sel.trim().toLowerCase() === 'true');
            else throw new Error('String was not recognized as a valid Boolean.');
          } else row.set(col.name, sel);
        } else if (col.type === 'integer' || col.type === 'decimal') row.set(col.name, 0);
        else row.set(col.name, ' ');
      } else if (c.type === 'CheckBox') {
        row.set(col.name, v === true || v === 'true');
      }
    }
    out.push({ schema: t, prefix: '', rows: found ? [row] : [] });
  }
  // DataTable.NewRow gives an identity column (FillSchema: AutoIncrement, seed 0, step 1) the next number; a non-key
  // one keeps it, so an update tries to set it ("Cannot update identity column"), as the original did. Inserts skip it.
  for (const t of out) {
    const ids = t.schema.columns.filter((c) => c.identity && !c.pk);
    t.rows.forEach((r, n) => ids.forEach((c) => r.get(c.name) === undefined && r.set(c.name, n)));
  }
  return { tables: out };
}

/** DataWrapper.GenerateKey(keyType, noOfKeys, BusinessUnit, out prefix). */
export async function generateKey(keyType, noOfKeys, businessUnit, tx) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const master = await query('Select * from IDMaster where IDTable=@k', { k: keyType }, tx);
  if (businessUnit > 0) await scalar('select Prefix from BusinessUnit where BUCode=@bu', { bu: businessUnit }, tx); // read but unused, as original
  const max = await scalar('Select Max(SLNo) from IDValue where IDTable=@k and Year=@yy', { k: keyType, yy: Number(yy) }, tx);
  if (!master.length) throw new Error('There is no row at position 0.');
  const m = master[0];
  const digits = Number(netString(m.NoOfDigit));
  let keyNo;
  if (max === null || netString(max) === '') {
    keyNo = `${netString(m.Series)}${yy}${'1'.padStart(digits, '0')}`.replaceAll(' ', '');
    await execute('Insert into IDValue(IDTable,Year,SLNo) values(@k,@yy,@sl)', { k: keyType, yy: Number(yy), sl: 1 + noOfKeys }, tx);
  } else {
    keyNo = `${netString(m.Series)}${yy}${netString(max).padStart(digits, '0')}`.replaceAll(' ', '');
    await execute('Update IDValue set SLNo=SLNo+@n where IDTable=@k and Year=@yy', { n: noOfKeys, k: keyType, yy: Number(yy) }, tx);
  }
  return { key: keyNo, prefix: netString(m.IDPrefix) };
}

/** DataWrapper.LogEvent. */
export async function logEvent(e, tx) {
  const { key } = await generateKey('EventLog', 1, e.businessUnit, tx);
  const now = e.at;
  await execute(
    'insert into EventLog (EventID, EventDate,EventTime,EventUser,Module,Action,AppResponse,Message,DocRef,TransactionData,BusinessUnit) values (@EventID,@EventDate,@EventTime,@EventUser,@Module,@Action,@AppResponse,@Message,@DocRef,@TransactionData,@BusinessUnit)',
    {
      EventID: key, EventDate: dMMMyyyy(now), EventTime: e.time ?? longTime(now), EventUser: e.user, Module: e.module, Action: e.action,
      AppResponse: e.ok ? 1 : 0, Message: e.message, DocRef: String(e.refId ?? 0), TransactionData: e.data, BusinessUnit: e.businessUnit,
    },
    tx,
  );
}

const event = (ctx, spec, ds, action) => ({
  businessUnit: Number(netString(ctx.businessUnit)) || 0,
  user: Number(netString(ctx.userCode)) || 0,
  // AActions.Save uses the table name when moduleID is "0"; Update/Delete always append moduleID ("0")
  module: action === 1 ? ds.tables[0].schema.name : '0',
  action,
  at: new Date(),
  data: '',
  refId: 0,
});

/** DataWrapper.InsertData: returns the key. Logs to EventLog only on failure, as the original. */
/** plain: DataWrapper.InsertDataWithoutTransaction from page code (no business unit in the DataSet's namespace: keys
 *  are generated for business unit 0; a failure is logged inside the transaction the page rolls back, so not at all) */
/** wrl: DataWrapper.InsertDataWithoutTransactionWRL (keys for the DataSet's business unit, no EventLog at all) */
export async function insert(spec, ds, ctx, { module, plain = false, wrl = false, then, tx: outer } = {}) {
  const ev = event(ctx, spec, ds, 1);
  if (plain) ev.businessUnit = 0;
  if (module) ev.module = module; // AActions.Save(form, moduleID): the EventLog module when it is not "0"
  // tx: inside the page's own transaction (dw.InsertDataWithoutTransaction after dw.BeginTransaction)
  const run = outer ? (fn) => fn(outer) : transaction;
  try {
    return await run(async (tx) => {
      const t0 = ds.tables[0];
      const pk = t0.schema.pk;
      let key = '';
      let prefix = '';
      if (pk && !t0.schema.col(pk).identity) {
        const given = longParse(t0.rows[0]?.get(pk));
        if (given <= 0n) {
          ({ key, prefix } = await generateKey(t0.schema.name, 1, ev.businessUnit, tx));
          t0.rows[0].set(pk, key); // as the original: the row has its key before the per-table check below
        } else key = String(given);
        ev.refId = key;
      }
      for (const t of ds.tables) {
        for (const r of t.rows) {
          const cols = t.schema.columns.filter((c) => (!c.identity && r.get(c.name) !== undefined) || c.name.toUpperCase() === 'ALIAS');
          if (!cols.length) throw new Error("Incorrect syntax near ')'.");
          const params = {};
          for (const c of t.schema.columns) {
            if (c.name.toUpperCase() === 'ALIAS' && dataText(r.get(c.name)).trim() === '') r.set(c.name, `${prefix}${key}`);
            if (t.prefix.split('.')[0].toLowerCase() === c.name.toLowerCase()) r.set(c.name, key);
            else if (t.schema.pk && t.prefix === '' && !c.identity && t.schema.pk === c.name && longParse(r.get(c.name)) === 0n) {
              // this table's own key still 0: a new key (for the first table's name, as the original) used from here on
              ({ key, prefix } = await generateKey(t0.schema.name, 1, ev.businessUnit, tx));
              ev.refId = key;
              r.set(c.name, key);
            }
            if (r.get(c.name) !== undefined) {
              // column list was fixed before FK/ALIAS were filled: a value set here only reaches the log, as in the original
              if (cols.includes(c)) params[`p${cols.indexOf(c)}`] = r.get(c.name);
              ev.data += `${c.name}:${dataText(r.get(c.name))}|`;
            }
          }
          const names = cols.map((c) => c.name).join(',');
          const vals = cols.map((c, i) => `@p${i}`).join(',');
          await execute(`insert into  ${t.schema.name}( ${names} ) values ( ${vals} )`, params, tx);
        }
      }
      if (then) await then(tx, key); // the page's own statements before CommitTransaction
      return key;
    });
  } catch (e) {
    if (!plain && !wrl) await logEvent({ ...ev, ok: false, message: e.message }).catch(() => {});
    throw e;
  }
}

/** DataWrapper.UpdateData: child tables (keyed grids / replaced children), main table, then re-inserted children. */
/** plain: DataWrapper.UpdateDataWithoutTransaction (no EventLog, empty text kept, no 0 for empty numbers), with
 *  then(tx) run in the same transaction (the page's own statements before CommitTransaction) */
export async function update(spec, ds, ctx, { plain = false, then, module } = {}) {
  const ev = event(ctx, spec, ds, 2);
  if (module) ev.module = module; // the DataSet's namespace named the module (e.g. "BUXUserXProcessOrder")
  try {
    return await transaction(async (tx) => {
      const t0 = ds.tables[0];
      const key = t0.schema.pk;
      if (!key) throw new Error('Index was outside the bounds of the array.');
      const keyVal = dataText(t0.rows[0]?.get(key));
      ev.refId = String(longParse(keyVal));
      // Child tables, last to first: keyed grids ("FK.RowKey") update each row or insert it when no row matched;
      // other children with a prefix are deleted here and re-inserted below. Rows removed from a keyed grid stay.
      for (let i = ds.tables.length - 1; i > 0; i--) {
        const t = ds.tables[i];
        if (t.prefix === '') continue;
        const parts = t.prefix.split('.');
        if (parts.length > 1) {
          const rk = parts[1];
          for (const r of t.rows) {
            const set = t.schema.columns.filter((c) => c.name !== key && r.get(c.name) !== undefined);
            const params = {};
            t.schema.columns.forEach((c, n) => {
              if (r.get(c.name) !== undefined) params[`p${n}`] = r.get(c.name);
              ev.data += `${c.name}:${dataText(r.get(c.name))}|`;
            });
            const idx = (name) => t.schema.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
            const sql = `Update ${t.schema.name} set ${set.map((c) => `${c.name}= @p${idx(c.name)}`).join(',')} where ${key}=@p${idx(key)} and ${rk}=@p${idx(rk)}`;
            if ((await execute(sql, params, tx)) !== 0) continue;
            const cols = t.schema.columns.filter((c) => !c.identity);
            const ins = {};
            cols.forEach((c, n) => {
              let v = r.get(c.name);
              if (parts[0] === c.name) v = keyVal;
              if (!plain && (v === undefined || v === null) && /decimal|int/i.test(c.dotnet)) v = 0;
              ins[`p${n}`] = v ?? null;
              ev.data += `${c.name}:${dataText(v)}|`;
            });
            await execute(`insert into  ${t.schema.name}( ${cols.map((c) => c.name).join(',')} ) values ( ${cols.map((c, n) => `@p${n}`).join(',')} )`, ins, tx);
          }
        } else {
          await execute(`delete from ${t.schema.name} where ${parts[0]} = @kv`, { kv: keyVal }, tx);
        }
      }
      for (const r of t0.rows) {
        const set = t0.schema.columns.filter((c) => c.name !== key && r.get(c.name) !== undefined);
        const params = {};
        for (const c of t0.schema.columns) {
          let v = r.get(c.name);
          const s = dataText(v);
          if (!plain && (s === '&nbsp' || s === ' ' || s === '')) v = null; // empty text becomes NULL on update
          params[`p${t0.schema.columns.indexOf(c)}`] = v ?? null;
          ev.data += `${c.name}:${dataText(v)}|`;
        }
        if (!set.length) throw new Error("Incorrect syntax near the keyword 'where'.");
        const sql = `Update ${t0.schema.name} set ${set.map((c) => `${c.name}= @p${t0.schema.columns.indexOf(c)}`).join(',')} where ${key}=@p${t0.schema.columns.indexOf(t0.schema.col(key))}`;
        await execute(sql, params, tx);
      }
      // Secondary (non-grid) tables: the original inserts their rows again on every update.
      for (const t of ds.tables.slice(1)) {
        if (t.prefix.split('.').length > 1) continue;
        for (const r of t.rows) {
          const cols = t.schema.columns.filter((c) => !c.identity);
          const params = {};
          cols.forEach((c, i) => {
            let v = r.get(c.name);
            if (t.prefix.split('.')[0] === c.name) v = keyVal;
            if (!plain && (v === undefined || v === null) && /decimal|int/i.test(c.dotnet)) v = 0;
            params[`p${i}`] = v ?? null;
            ev.data += `${c.name}:${dataText(v)}|`;
          });
          await execute(`insert into  ${t.schema.name}( ${cols.map((c) => c.name).join(',')} ) values ( ${cols.map((c, i) => `@p${i}`).join(',')} )`, params, tx);
        }
      }
      if (then) await then(tx);
      if (!plain) await logEvent({ ...ev, ok: true, message: 'Successfull' }, tx);
      return keyVal;
    });
  } catch (e) {
    if (!plain) await logEvent({ ...ev, ok: false, message: e.message }).catch(() => {}); // plain: logged inside the transaction the page rolls back
    throw e;
  }
}

/** DataWrapper.CancelData (soft delete: Status=200). Child deletes are built but never run in the original. */
export async function cancel(spec, ds, ctx, remark = '', { module } = {}) {
  const ev = event(ctx, spec, ds, 3);
  if (module) ev.module = module;
  try {
    return await transaction(async (tx) => {
      const t0 = ds.tables[0];
      const key = t0.schema.pk;
      if (!key) throw new Error('Index was outside the bounds of the array.');
      const keyVal = dataText(t0.rows[0]?.get(key));
      ev.refId = String(longParse(keyVal));
      for (let i = ds.tables.length - 1; i > 0; i--) {
        const p = ds.tables[i].prefix.split('.')[0];
        if (p !== '') ev.data += `${ds.tables[i].schema.name}:${p}:${keyVal}`;
      }
      const hasRemark = !!t0.schema.col('CancelRemark');
      ev.data += `${t0.schema.name}:${key}:${keyVal}`;
      await execute(
        hasRemark ? `Update ${t0.schema.name} set Status=200, CancelRemark=@remark  where ${key} = @kv` : `Update ${t0.schema.name} set Status=200 where ${key} = @kv`,
        { remark: netString(remark), kv: keyVal },
        tx,
      );
      await logEvent({ ...ev, ok: true, message: 'Successfull' }, tx);
      return key;
    });
  } catch (e) {
    await logEvent({ ...ev, ok: false, message: e.message }).catch(() => {});
    throw e;
  }
}


export { enInDateTime };
