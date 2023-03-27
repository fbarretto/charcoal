import "./Subtle.scss";

export function Subtle({
  children,
  className,
  ...props
}: React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLSpanElement>,
  HTMLSpanElement
>) {
  return (
    <span
      className={"subtle" + (className == null ? "" : ` ${className}`)}
      {...props}
    >
      {children}
    </span>
  );
}
