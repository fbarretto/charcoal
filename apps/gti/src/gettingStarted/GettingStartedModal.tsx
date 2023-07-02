import { bugButtonNux } from "../BugButton";
import { useCommand } from "../GTIShortcuts";
import { Modal } from "../Modal";
import platform from "../platform";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { observableConfig } from "../config_observable";

export const hasShownGettingStarted = observableConfig<boolean | null>({
  config: "gti.hasShownGettingStarted",
  default: false,
});

export function GettingStartedModal() {
  const hasShownAlready = hasShownGettingStarted.get();
  const [isShowingStable, setIsShowingStable] = useState(false);

  useEffect(() => {
    if (hasShownAlready === false) {
      setIsShowingStable(true);
      hasShownGettingStarted.set(true);
    }
  }, [hasShownAlready]);
  if (!isShowingStable) {
    return null;
  }
  return <DismissableModal />;
}

function DismissableModal() {
  const [visible, setVisible] = useState(true);
  useCommand("Escape", () => {
    setVisible(false);
  });

  useEffect(() => {
    if (!visible && platform.GettingStartedBugNuxContent) {
      bugButtonNux.set(platform.GettingStartedBugNuxContent);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const ContentComponent = platform.GettingStartedContent;
  if (ContentComponent == null) {
    return null;
  }

  return (
    <Modal className="getting-started-modal">
      <Suspense fallback={<Icon icon="loading" />}>
        <ContentComponent dismiss={() => setVisible(false)} />
      </Suspense>
    </Modal>
  );
}
