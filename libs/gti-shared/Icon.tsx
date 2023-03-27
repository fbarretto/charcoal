import "@vscode/codicons/dist/codicon.css";
import "./Icon.scss";

export function Icon({
  icon,
  size,
  slot,
  ...other
}: {
  slot?: "start";
  icon: string;
  size?: "S" | "M" | "L";
} & React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLDivElement>,
  HTMLDivElement
>) {
  return (
    <div
      slot={slot}
      className={`codicon codicon-${icon} icon-size-${size ?? "S"}`}
      {...other}
    />
  );
}
