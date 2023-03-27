import type { ReactNode } from "react";

import { useEffect, useState } from "react";

/**
 * Hide children until the given timestamp.
 */
export function Delayed({
  children,
  hideUntil,
}: {
  children: ReactNode;
  hideUntil: Date;
}): JSX.Element {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const delay = hideUntil.getTime() - Date.now();
    if (delay > 0) {
      setVisible(false);
      const timer = setTimeout(() => {
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [hideUntil, setVisible]);

  // Cast to JSX.Element to make testing-library happy.
  return (visible ? children : null) as JSX.Element;
}
