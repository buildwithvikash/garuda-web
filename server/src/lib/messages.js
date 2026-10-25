// Operator-facing wording for the messages the ported page code produces. The handlers keep the original texts (the
// parity scripts compare them with the original DLLs); only what leaves the /forms API is reworded here, and the
// original is written to the server log.

// Compared without case or punctuation: errorMsg / exceptionAlert already strip , . ' " ; from most of them.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SUPPORT = 'Something went wrong on the server. Please tell your supervisor; the details are in the server log.';

/** [pattern on the normalised text, operator text] — first match wins */
const RULES = [
  // .NET runtime messages the original surfaced from its catch blocks
  [/there is no row at position/, 'Nothing was found for what you scanned or selected. Check the barcode, the station and the order.'],
  [/object reference not set/, 'Some information this step needs is missing. Check the fields and scan again.'],
  [/index was (outside|out of range)/, 'Some information this step needs is missing. Check the fields and scan again.'],
  [/input string was not in a correct format/, 'A number field has a value that is not a number.'],
  [/not recognized as a valid datetime/, 'Enter a valid date.'],
  [/timespan/, 'Enter a valid time.'],
  [/not recognized as a valid boolean/, 'A yes / no value is not valid.'],
  [/attempted to divide by zero/, 'A quantity of zero cannot be used here.'],
  [/^(incorrect syntax|unknown column|unknown operator|invalid column name|invalid object name)|does not belong to table|unable to cast|index and length must refer|string must be exactly one character/, SUPPORT],
  // SQL Server
  [/deadlock|timeout|timed out|connection (is )?closed|failed to connect/, 'The system is busy. Wait a moment and try again.'],
  [/conversion failed|error converting/, 'A value has the wrong format.'],
  [/violation of (unique|primary key)|cannot insert duplicate key/, 'This record already exists.'],
  // shop floor
  [/^invalid work center$/, 'Station not found. Scan the station barcode again.'],
  [/^please scan work station$/, 'Scan the work station first.'],
  [/^please scan barcode$|^please scan a barcode$|^please scan$/, 'Scan the barcode first.'],
  [/^invalid barcode not for this station$/, 'This barcode is not known, or it is not for this station.'],
  [/^barcode ?no does not exist( in database)?$/, 'This barcode is not in the system.'],
  [/^already scanned$/, 'This barcode has already been scanned.'],
  [/^process already completed$/, 'This stage is already complete for this unit.'],
  [/^material is not qc approved$/, 'This material has not passed the quality check yet.'],
  [/^barcode is already inspected or does not belongs to this order$/, 'This unit is already inspected, or it belongs to another order.'],
  [/^printer i[sf] offline$/, 'The printer is offline. Check the printer, or choose another one.'],
  [/^(please )?select a printer$/, 'Choose a printer first.'],
  [/^please select (a )?status$/, 'Choose the result (pass or fail) first.'],
  [/^please select action$/, 'Choose the next action first.'],
  [/^please select defect$/, 'Add at least one defect for a failed unit.'],
  [/^order is on hold$/, 'This production order is on hold. Scanning is blocked until it is released.'],
  [/^order is cancelled$/, 'This production order is cancelled. Units of it cannot be scanned.'],
];

/** misspellings in the original texts */
const TYPOS = [
  [/\bDepartmet\b/gi, 'Department'],
  [/\bSuccefully\b/gi, 'Successfully'],
  [/\bParamaters\b/gi, 'Parameters'],
  [/\bQuantiry\b/gi, 'Quantity'],
  [/\bPasword\b/gi, 'Password'],
  [/\bLenght\b/gi, 'Length'],
  [/\bSerise\b/gi, 'Series'],
  [/\bInvaild\b/gi, 'Invalid'],
  [/\bVeiw\b/gi, 'View'],
  [/\bbelongs to\b/gi, 'belong to'],
];

/** The operator's wording for an original message (unchanged when nothing applies). */
export function friendly(text) {
  if (typeof text !== 'string' || text.trim() === '') return text;
  const n = norm(text.replaceAll('&#44', ','));
  for (const [re, out] of RULES) if (re.test(n)) return out;
  return TYPOS.reduce((s, [re, out]) => s.replace(re, out), text);
}

/** A response body with its alert / message / statusMessage reworded; each change is logged with the original. */
export function friendlyBody(body, where) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  let out = body;
  for (const k of ['alert', 'message', 'statusMessage']) {
    const v = body[k];
    const f = friendly(v);
    if (f === v) continue;
    out = out === body ? { ...body } : out;
    out[k] = f;
    console.warn(`[message] ${where} ${k}: ${JSON.stringify(v)}`);
  }
  return out;
}
