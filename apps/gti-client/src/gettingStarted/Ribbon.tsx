import "./Ribbon.scss";

export function Ribbon({ children }: { children: React.ReactNode }) {
  return (
    <div className="ribbon ribbon-top-right">
      <span>{children}</span>
    </div>
  );
}
