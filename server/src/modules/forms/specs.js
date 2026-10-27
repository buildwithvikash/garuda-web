// The screens this app offers: the specs extracted from the original pages (scripts/extract-forms.mjs), keep-list only.
import { readFileSync } from 'node:fs';
import { KEEP } from '../menu/keep.js';

export const FORMS = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./forms.json', import.meta.url), 'utf8'))).filter(([r]) => KEEP.has(r)));
