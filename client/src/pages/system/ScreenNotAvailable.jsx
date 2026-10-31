// Shown for a route the server does not list for this user, or that does not exist.
// Fills the whole page area: a quiet grid backdrop, the reason, what to do next, and shortcuts to the user's own screens.
import {
  ArrowLeft,
  ArrowRight,
  Home,
  Link2Off,
  LockKeyhole,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import { useMe } from "@/layouts/AppLayout.jsx";
import { flatten, groupsOf } from "@/layouts/Sidebar.jsx";

const REASONS = [
  {
    icon: LockKeyhole,
    title: "No access",
    text: "Your role is not allowed to open this screen.",
  },
  {
    icon: Wrench,
    title: "Not set up yet",
    text: "The screen has not been enabled for your unit.",
  },
  {
    icon: Link2Off,
    title: "Old link",
    text: "The address was typed wrongly or no longer exists.",
  },
];

export default function ScreenNotAvailable({ pathname }) {
  const navigate = useNavigate();
  const me = useMe();

  // A few of the user's own screens, so there is always somewhere to go next.
  const suggestions = useMemo(() => {
    const out = [];
    for (const g of groupsOf(me?.menu ?? [])) {
      const first = flatten(g.children ?? [])[0];
      if (first) out.push({ ...first, group: g.caption });
      if (out.length === 6) break;
    }
    return out;
  }, [me]);

  return (
    <div className="animate-page relative flex h-full min-h-0 flex-col items-center overflow-y-auto px-4 py-6 sm:px-8">
      {/* backdrop: faint grid that fades out toward the edges, and a soft brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_70%_60%_at_50%_42%,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[12%] left-1/2 size-115 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative my-auto flex w-full max-w-3xl flex-col items-center text-center">
        {/* icon with soft rings */}
        <div className="relative mb-5 grid size-24 place-items-center">
          <span className="absolute inset-0 rounded-full border border-primary/15" />
          <span className="absolute inset-2.5 rounded-full border border-primary/25" />
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <ShieldAlert className="size-7" strokeWidth={1.75} />
          </span>
        </div>

        <p className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Screen not available
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          We can’t open this screen
        </h1>
        <p className="mt-3 max-w-xl text-balance text-muted-foreground">
          The screen you asked for is not available to your account. Choose a
          screen from the menu, or go back to where you were.
        </p>

        <code
          className="mt-4 max-w-full truncate rounded-lg border bg-muted/60 px-3 py-1.5 font-mono text-xs text-muted-foreground"
          title={pathname}
        >
          {pathname}
        </code>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/start">
              <Home /> Back to home
            </Link>
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft /> Go back
          </Button>
        </div>

        {/* why it can happen */}
        <div className="mt-9 grid w-full gap-3 sm:grid-cols-3">
          {REASONS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-xl border bg-card/80 p-4 text-left shadow-xs backdrop-blur"
            >
              <span className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </div>

        {/* shortcuts to the user's own screens */}
        {suggestions.length > 0 && (
          <div className="mt-7 w-full text-left">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Search className="size-4" /> Or open one of your screens
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s) => (
                <Link
                  key={s.route}
                  to={s.route}
                  className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.caption}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.group}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
