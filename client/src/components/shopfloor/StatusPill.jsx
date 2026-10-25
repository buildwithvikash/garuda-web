import { Badge } from "@/components/ui/badge.jsx";

const PILLS = {
  2: ["Completed", "success"],
  1: ["In process", "info"],
  0: ["Pending", "neutral"],
};

/** A route stage's status (0 waiting, 1 started, 2 completed). */
export default function StatusPill({ status }) {
  const [text, variant] = PILLS[status] ?? PILLS[0];
  return (
    <Badge variant={variant} dot>
      {text}
    </Badge>
  );
}
