import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useState } from "react";
import { observableConfig } from "../config_observable";
import { useCommand } from "../GTIShortcuts";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { DismissButton, SquareLink, Squares, Subtitle } from "./Components";
import "./GettingStarted.scss";

export const hasShownGettingStarted = observableConfig<boolean | null>({
  config: "gti.hasShownGettingStarted",
  default: null,
  defaultAfterNetworkReturn: false,
});

export const GettingStartedModal = observer(() => {
  const hasShownAlready = hasShownGettingStarted.get();

  if (hasShownAlready || hasShownAlready === null) {
    return null;
  }

  return <DismissableModal />;
});

const DismissableModal = observer(() => {
  const [visible, setVisible] = useState(true);
  const dismiss = useCallback(() => {
    setVisible(false);
    runInAction(() => {
      hasShownGettingStarted.set(true);
    });
  }, [setVisible, hasShownGettingStarted]);

  useCommand("Escape", dismiss);

  if (!visible) {
    return null;
  }

  return (
    <Modal className="getting-started-modal">
      <DismissButton dismiss={dismiss} />
      <div className="content">
        <header>
          <h1>Welcome to the GTI beta 🎉</h1>
          <h3>The coolest new kid on the block</h3>
        </header>
        <main>
          <Subtitle>Code review for fast moving teams.</Subtitle>
          <p>
            Graphite interactive brings a lot of the magic of Graphite to your
            desktop.
          </p>
          <Squares>
            <SquareLink href="https://app.graphite.dev">
              <div className="square-icon">
                <Icon size="L" icon="account" />
              </div>
              <div>Account</div>
            </SquareLink>
            <SquareLink href="https://graphite.dev/docs">
              <div className="square-icon">
                <Icon size="L" icon="mortar-board" />
              </div>
              <div>Docs</div>
            </SquareLink>
            <SquareLink href="https://github.com/withgraphite/graphite-cli">
              <div className="square-icon">
                <Icon size="L" icon="github" />
              </div>
              <div>Github</div>
            </SquareLink>
          </Squares>
          <p>
            This is very much still in beta, so as you find bugs please report
            them by either emailing support@graphite.dev or using the bug button
            in the top right! Happy stacking!
          </p>
        </main>
        <footer>
          <VSCodeButton
            key="help-button"
            appearance="secondary"
            onClick={dismiss}
          >
            <>Let's go</>
          </VSCodeButton>
        </footer>
      </div>
    </Modal>
  );
});
