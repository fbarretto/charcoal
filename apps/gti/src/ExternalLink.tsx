import type { AnchorHTMLAttributes, DetailedHTMLProps, ReactNode } from "react";

import platform from "./platform";

/**
 * Link which opens url in a new browser tab
 */
export function ExternalLink(
  props: {
    url?: string;
    children: ReactNode;
    className?: string;
  } & DetailedHTMLProps<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  >
) {
  const { url, children, ...otherProps } = props;
  const handleClick = (
    event:
      | React.MouseEvent<HTMLAnchorElement>
      | React.KeyboardEvent<HTMLAnchorElement>
  ) => {
    // allow pressing Enter when focused to simulate clicking for accessability
    if (event.type === "keyup") {
      if ((event as React.KeyboardEvent<HTMLAnchorElement>).key !== "Enter") {
        return;
      }
    }
    if (url) {
      platform.openExternalLink(url);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <a
      href={url}
      target="_blank"
      // Allow links to be focused
      tabIndex={0}
      onKeyUp={handleClick}
      onClick={handleClick}
      {...otherProps}
    >
      {children}
    </a>
  );
}
