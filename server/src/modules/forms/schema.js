// SqlDataAdapter.FillSchema equivalent: columns with the .NET type name ADO.NET would give them, nullability,
// max length, identity and primary key. The engine's rules (ControlA.DataType) key off those .NET type names.
import { query } from '../../db/index.js';

const DOTNET = {
  int: 'Int32', bigint: 'Int64', smallint: 'Int16', tinyint: 'Byte', bit: 'Boolean',
  decimal: 'Decimal', numeric: 'Decimal', money: 'Decimal', smallmoney: 'Decimal', float: 'Double', real: 'Single',
  datetime: 'DateTime', datetime2: 'DateTime', smalldatetime: 'DateTime', date: 'DateTime', datetimeoffset: 'DateTimeOffset', time: 'TimeSpan',
  char: 'String', varchar: 'String', nchar: 'String', nvarchar: 'String', text: 'String', ntext: 'String', xml: 'String',
  uniqueidentifier: 'Guid', binary: 'Byte[]', varbinary: 'Byte[]', image: 'Byte[]', timestamp: 'Byte[]', rowversion: 'Byte[]',
};

/** ControlA.DataType: substring rules on the .NET type name ("" when nothing matches, e.g. Double). */
export function engineType(dotnet) {
  const t = dotnet.toLowerCase();
  if (t.includes('int')) return 'integer';
  if (t.includes('string')) return 'string';
  if (t.includes('bool')) return 'boolean';
  if (t.includes('byte')) return 'byte';
  if (t.includes('decimal')) return 'decimal';
  if (t.includes('datetime')) return 'datetime';
  if (t.includes('date')) return 'date';
  return '';
}

const cache = new Map();

export async function tableSchema(name) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const cols = await query(
    `select c.name, t.name type, c.max_length, c.is_nullable, c.is_identity, c.scale,
            case when exists (select 1 from sys.index_columns ic join sys.indexes i on i.object_id = ic.object_id and i.index_id = ic.index_id
                              where i.is_primary_key = 1 and ic.object_id = c.object_id and ic.column_id = c.column_id) then 1 else 0 end pk
       from sys.columns c join sys.types t on t.user_type_id = c.user_type_id
      where c.object_id = object_id(@name) order by c.column_id`,
    { name },
  );
  if (!cols.length) throw new Error(`Invalid object name '${name}'.`);
  const columns = cols.map((c) => {
    const dotnet = DOTNET[c.type] ?? 'String';
    // DataColumn.MaxLength from FillSchema: (n)varchar(max)/text -> 2147483647, ntext -> 1073741823
    const chars = c.max_length === -1 || c.type === 'text' ? 2147483647 : c.type === 'ntext' ? 1073741823 : /^n(var)?char$/.test(c.type) ? c.max_length / 2 : c.max_length;
    return {
      name: c.name,
      sqlType: c.type,
      dotnet,
      type: engineType(dotnet),
      maxLength: dotnet === 'String' ? chars : -1,
      nullable: !!c.is_nullable,
      identity: !!c.is_identity,
      scale: c.scale,
      pk: !!c.pk,
    };
  });
  const s = {
    name,
    columns,
    col: (n) => columns.find((c) => c.name.toLowerCase() === String(n).toLowerCase()) ?? null,
    pk: columns.find((c) => c.pk)?.name ?? null,
  };
  cache.set(key, s);
  return s;
}

/** AActions.TableList + ExecuteSchema: TopPanel Tag "T1|T2|*..." -> schemas (names with "*" or empty skipped). */
export async function formTables(spec) {
  const names = (spec.top?.tag ?? '').replaceAll('|*', '').split('|').filter((t) => t.trim() !== '' && !t.includes('*'));
  const out = [];
  for (const n of names) out.push(await tableSchema(n));
  return out;
}
