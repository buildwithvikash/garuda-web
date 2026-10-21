const VARIANTS = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  primary: 'bg-blue-600 text-white border-blue-600',
};
const DOTS = {
  success: 'bg-emerald-500', warning: 'bg-amber-500', info: 'bg-blue-500', danger: 'bg-rose-500', neutral: 'bg-slate-400', violet: 'bg-violet-500', primary: 'bg-white',
};

/** Status pill: soft colour and a clear word, so state never depends on colour alone. */
export default function Badge({ variant = 'neutral', children, dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-md border ${VARIANTS[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOTS[variant]}`} />}
      {children}
    </span>
  );
}

export const ActiveBadge = ({ active }) => <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>;
