import { Icon } from "@withgraphite/gti-shared/Icon";

import "./ComponentUtils.scss";

export function LargeSpinner() {
  return (
    <div data-testid="loading-spinner">
      <Icon icon="loading" size="L" />
    </div>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="center-container">{children}</div>;
}

export function FlexRow({ children }: { children: React.ReactNode }) {
  return <div className="flex-row">{children}</div>;
}
