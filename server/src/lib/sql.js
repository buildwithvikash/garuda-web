// Guards for values spliced into SQL text (the ported queries keep the original's SQL). Every value that is not
// passed as a parameter goes through one of these: they reject anything that could change the statement.
import { netString } from './net.js';

/** a number, or blank (SQL that then fails as the original did) */
export const num = (x) => {
  const s = netString(x);
  if (!/^-?\d*(\.\d+)?$/.test(s)) throw new Error(`Incorrect syntax near '${s}'.`);
  return s;
};

/** digits only, or blank */
export const digitsOrEmpty = (x) => {
  const s = netString(x);
  if (!/^\d*$/.test(s)) throw new Error(`Incorrect syntax near '${s}'.`);
  return s;
};

/** digits only, never blank */
export const requireDigits = (x) => {
  const s = netString(x);
  if (!/^\d+$/.test(s)) throw new Error(`Incorrect syntax near '='.`);
  return s;
};

/** a quoted varchar literal, quotes escaped */
export const lit = (x) => `'${netString(x).replaceAll("'", "''")}'`;
