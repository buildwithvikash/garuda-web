// The colour palette of the app's "tones": one place that says what blue, green, amber ... look like in cards,
// section headers, sidebar groups, chips and charts. Class names are written out in full so Tailwind can find them.
//
//   import { toneFor } from '@/lib/tones.js';
//   const t = toneFor('emerald');       // or toneFor(undefined, 'Order') to pick one from a title
//   <span className={`${t.soft} ${t.text}`}>
//
// Keys of a tone:  solid (strong background)  soft (tinted background)  tint (header gradient start)  text  glow (shadow)
//                  chip (bordered chip)  bar (chart bar / dot)  fill / stroke (SVG)  borderL (left accent)

export const TONES = {
  blue: {
    solid: 'bg-blue-600', soft: 'bg-blue-500/10', tint: 'from-blue-500/[0.07]', text: 'text-blue-600 dark:text-blue-400', glow: 'shadow-blue-600/25',
    chip: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300', bar: 'bg-blue-500', fill: 'fill-blue-500', stroke: 'stroke-blue-500', borderL: 'border-l-blue-500',
  },
  indigo: {
    solid: 'bg-indigo-600', soft: 'bg-indigo-500/10', tint: 'from-indigo-500/[0.07]', text: 'text-indigo-600 dark:text-indigo-400', glow: 'shadow-indigo-600/25',
    chip: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', bar: 'bg-indigo-500', fill: 'fill-indigo-500', stroke: 'stroke-indigo-500', borderL: 'border-l-indigo-500',
  },
  emerald: {
    solid: 'bg-emerald-600', soft: 'bg-emerald-500/10', tint: 'from-emerald-500/[0.07]', text: 'text-emerald-600 dark:text-emerald-400', glow: 'shadow-emerald-600/25',
    chip: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', fill: 'fill-emerald-500', stroke: 'stroke-emerald-500', borderL: 'border-l-emerald-500',
  },
  amber: {
    solid: 'bg-amber-500', soft: 'bg-amber-500/10', tint: 'from-amber-500/[0.08]', text: 'text-amber-600 dark:text-amber-400', glow: 'shadow-amber-500/30',
    chip: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500', fill: 'fill-amber-500', stroke: 'stroke-amber-500', borderL: 'border-l-amber-500',
  },
  rose: {
    solid: 'bg-rose-600', soft: 'bg-rose-500/10', tint: 'from-rose-500/[0.07]', text: 'text-rose-600 dark:text-rose-400', glow: 'shadow-rose-600/25',
    chip: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300', bar: 'bg-rose-500', fill: 'fill-rose-500', stroke: 'stroke-rose-500', borderL: 'border-l-rose-500',
  },
  violet: {
    solid: 'bg-violet-600', soft: 'bg-violet-500/10', tint: 'from-violet-500/[0.07]', text: 'text-violet-600 dark:text-violet-400', glow: 'shadow-violet-600/25',
    chip: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300', bar: 'bg-violet-500', fill: 'fill-violet-500', stroke: 'stroke-violet-500', borderL: 'border-l-violet-500',
  },
  cyan: {
    solid: 'bg-cyan-600', soft: 'bg-cyan-500/10', tint: 'from-cyan-500/[0.07]', text: 'text-cyan-600 dark:text-cyan-400', glow: 'shadow-cyan-600/25',
    chip: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', bar: 'bg-cyan-500', fill: 'fill-cyan-500', stroke: 'stroke-cyan-500', borderL: 'border-l-cyan-500',
  },
  slate: {
    solid: 'bg-slate-600', soft: 'bg-slate-500/10', tint: 'from-slate-500/[0.06]', text: 'text-slate-600 dark:text-slate-400', glow: 'shadow-slate-600/20',
    chip: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300', bar: 'bg-slate-500', fill: 'fill-slate-500', stroke: 'stroke-slate-500', borderL: 'border-l-slate-500',
  },
};

const ALIAS = { green: 'emerald', red: 'rose', orange: 'amber', yellow: 'amber', purple: 'violet', teal: 'cyan', sky: 'cyan', gray: 'slate', grey: 'slate' };

/** The order the sidebar groups take their colours in. */
export const SIDEBAR_ORDER = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'indigo'];

// Section titles get a colour of their own (the same title always gets the same colour). Red is kept for errors.
const AUTO = ['blue', 'emerald', 'violet', 'amber', 'cyan', 'indigo'];

/** A tone by name, or (when no name is given) one picked from `seed`, such as a section title. */
export function toneFor(name, seed = '') {
  const key = ALIAS[name] ?? name;
  if (TONES[key]) return TONES[key];
  if (!seed) return TONES.blue;
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[AUTO[h % AUTO.length]];
}
