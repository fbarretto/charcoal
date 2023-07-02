import type { ReactNode } from "react";

import "./InlineBadge.scss";

export function InlineBadge({
  children,
  kind,
}: {
  children: ReactNode;
  kind?: "primary" | "secondary";
}) {
  return (
    <div className={`inline-badge badge-${kind ?? "secondary"}`}>
      {children}
    </div>
  );
}
