import "./EmptyState.scss";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div>{children}</div>
    </div>
  );
}
