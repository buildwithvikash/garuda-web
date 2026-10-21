// Read-only: column names/types of the tables the foundation uses, plus the login-related settings.
import { query } from '../../src/db/index.js';

const tables = ['Users', 'UserBusinessUnits', 'UserRoleForm', 'Settings', 'Company', 'BusinessUnit', 'ProductionLine', 'employee', 'Modules'];
for (const t of tables) {
  const cols = await query(
    `select COLUMN_NAME n, DATA_TYPE t from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME=@t order by ORDINAL_POSITION`,
    { t },
  );
  const rows = cols.length ? (await query(`select count(*) c from [${t}]`))[0].c : '-';
  console.log(`${t} (${rows} rows): ${cols.map((c) => `${c.n}:${c.t}`).join(', ') || 'TABLE NOT FOUND'}`);
}
const s = await query(
  "select * from Settings where cast(1 as bit)=1",
);
const keyCol = Object.keys(s[0] ?? {})[0];
const wanted = ['PasswordEncrypt', 'UserManagement'];
console.log('Settings first column:', keyCol, '| login settings:', s.filter((r) => wanted.includes(String(Object.values(r)[0]))).map((r) => Object.values(r).slice(0, 2).join('=')).join(', '));
process.exit(0);
