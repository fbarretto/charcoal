import type { ReactNode } from "react";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useLayoutEffect, useState, useRef } from "react";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./SeeMoreContainer.scss";

const MAX_NON_EXPANDBLE_HEIGHT_PX = 275;

export function SeeMoreContainer({ children }: { children: ReactNode }) {
  const ref = useRef<null | HTMLDivElement>(null);
  const [shouldShowExpandButton, setShouldShowExpandbutton] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element != null && element.scrollHeight > MAX_NON_EXPANDBLE_HEIGHT_PX) {
      shouldShowExpandButton === false && setShouldShowExpandbutton(true);
    } else {
      shouldShowExpandButton === true && setShouldShowExpandbutton(false);
    }
    // Weird: we pass children to trick it to rerun this effect when the selected commit changes
    // We could also do this by passing a new key to <SeeMoreContainer> in the caller
  }, [ref, shouldShowExpandButton, children]);

  return (
    <div className="see-more-container">
      <div
        className={`see-more-container-${
          isExpanded ? "expanded" : "collapsed"
        }`}
        ref={ref}
      >
        {children}
      </div>
      {shouldShowExpandButton ? (
        <div className={`see-${isExpanded ? "less" : "more"}-button`}>
          <VSCodeButton
            appearance="icon"
            onClick={() => setIsExpanded((val) => !val)}
          >
            <Icon icon={isExpanded ? "fold-up" : "fold-down"} slot="start" />
            {isExpanded ? <>See less</> : <>See more</>}
          </VSCodeButton>
        </div>
      ) : null}
    </div>
  );
}
