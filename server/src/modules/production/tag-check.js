// The asset and green tags of WIP Capture's FG label stage, each set by a Serial Generation Logic on the material (owner,
// 1 Nov 2026; db/migrations/2026-11-tag-logic.sql): no logic no tag, a Generate logic fills it, a Check logic takes a
// scanned tag and tests it here. Date parts are tested by format only: a tag printed last month is still good.
import { query, scalar } from "../../db/pool.js";
import { netInt, netString } from "../../shared/net.js";
import { assetLogicRows } from "./wip.service.js";

/** 'none' | 'generate' | 'check' */
export const tagMode = (logic, useFor) =>
  netInt(logic) <= 0 ? "none" : netInt(useFor) === 1 ? "check" : "generate";

/** the scanned unit's material and how each of its tags is set */
export async function tagSetup(serial) {
  const [r] = await query(
    `select top 1 mb.Material, m.AssetTagType, m.GreenTagLogic, a.UseFor AssetUse, g.UseFor GreenUse from MaterialBarcode mb
     inner join Material m on m.MatCode = mb.Material
     left join SerialGenerationLogicHeader a on a.SerialCode = m.AssetTagType
     left join SerialGenerationLogicHeader g on g.SerialCode = m.GreenTagLogic where mb.Serial = @s`,
    { s: netString(serial).trim() },
  );
  if (!r)
    return {
      material: "",
      asset: { logic: "", mode: "none" },
      green: { logic: "", mode: "none" },
    };
  return {
    material: netString(r.Material),
    asset: {
      logic: netString(r.AssetTagType),
      mode: tagMode(r.AssetTagType, r.AssetUse),
    },
    green: {
      logic: netString(r.GreenTagLogic),
      mode: tagMode(r.GreenTagLogic, r.GreenUse),
    },
  };
}

const text = (v) => (v === null || v === undefined ? "" : String(v));
const within = (n, low, high) => n >= low && n <= high;

/** the date part a Year / Month / Week line expects at the start of s: its length, or why not */
function datePart(line, s) {
  const code = text(line.VariantCode);
  const format = text(line.Format).trim().toUpperCase();
  const two = /^\d{2}/.test(s) ? Number(s.slice(0, 2)) : null;
  if (code === "4")
    return two !== null && within(two, 1, 53)
      ? { length: 2 }
      : { want: "a week from 01 to 53" };
  if (code === "1") {
    if (format === "YY")
      return two !== null ? { length: 2 } : { want: "a 2-digit year" };
    if (format === "YYYY")
      return /^\d{4}/.test(s) ? { length: 4 } : { want: "a 4-digit year" };
  } else if (format === "MM")
    return two !== null && within(two, 1, 12)
      ? { length: 2 }
      : { want: "a month from 01 to 12" };
  else if (format.startsWith("ALPHA-") && format.length === 7) {
    const first = format.charCodeAt(6);
    const last = String.fromCharCode(first + 11);
    return s !== "" && within(s.charCodeAt(0), first, first + 11)
      ? { length: 1 }
      : { want: `a month letter from ${format[6]} to ${last}` };
  }
  return {
    bad: `its ${text(line.Name) || "date"} part has no format this check knows`,
  };
}

/** why a tag does not match the logic's lines (in sequence order), or null when it does.
 *  altName: the material's Alt Name, for a Model line. */
export function tagMismatch(tag, lines, altName = "") {
  if (!lines.length) return "the logic has no parts";
  let s = text(tag);
  const need = (want) =>
    `expected ${want} at character ${text(tag).length - s.length + 1}`;
  for (const line of lines) {
    const code = text(line.VariantCode);
    if (code === "1" || code === "2" || code === "4") {
      const d = datePart(line, s);
      if (d.bad) return d.bad;
      if (d.want) return need(d.want);
      s = s.slice(d.length);
    } else if (code === "10") {
      const length = netInt(line.Length);
      const digits = /^\d+/.exec(s)?.[0] ?? "";
      if (length > 0 ? digits.length < length : digits === "")
        return need(length > 0 ? `a ${length}-digit number` : "a number");
      const number = length > 0 ? digits.slice(0, length) : digits;
      const n = BigInt(number);
      const [start, end] = [
        BigInt(netString(line.StartingNo).trim() || 0),
        BigInt(netString(line.EndingNo).trim() || 0),
      ];
      if (n < start)
        return `the number ${number} is below the logic's start ${start}`;
      if (end > 0n && n > end)
        return `the number ${number} is above the logic's end ${end}`;
      s = s.slice(number.length);
    } else if (code !== "3") {
      // Day (3) adds nothing, as the generator; the rest are fixed: the model's Alt Name or the line's own value
      const fixed = code === "11" ? text(altName) : text(line.Value).trim();
      if (!s.startsWith(fixed)) return need(`"${fixed}"`);
      s = s.slice(fixed.length);
    }
    const sep =
      text(line.Seperator).toLowerCase() === "spc" ? " " : text(line.Seperator);
    if (!s.startsWith(sep)) return need(`"${sep}"`);
    s = s.slice(sep.length);
  }
  return s === "" ? null : `"${s}" is left over after the end of the logic`;
}

/** tagMismatch for a saved logic and material */
export async function checkTag(tag, logic, material) {
  const lines = await assetLogicRows(logic);
  const altName = lines.some((l) => text(l.VariantCode) === "11")
    ? await scalar("Select AltName from Material where MatCode=@m", {
        m: netString(material),
      })
    : "";
  return tagMismatch(netString(tag).trim(), lines, altName);
}
