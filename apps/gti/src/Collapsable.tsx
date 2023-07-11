import { useState } from "react";
import { Icon } from "./Icon";
import "./Collapsable.scss";

export function Collapsable({
  startExpanded,
  children,
  title,
  className,
}: {
  startExpanded?: boolean;
  children: React.ReactNode;
  title: React.ReactNode;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(startExpanded === true);
  return (
    <div className={"collapsable" + (className ? ` ${className}` : "")}>
      <div
        className="collapsable-title"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Icon icon={isExpanded ? "chevron-down" : "chevron-right"} /> {title}
      </div>
      {isExpanded ? (
        <div className="collapsable-contents">{children}</div>
      ) : null}
    </div>
  );
}
