import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { Copyable } from "./Copyable";
import { DropdownFields } from "./DropdownFields";
import platform from "./platform";
import { applicationinfo } from "./serverAPIState";
import { Tooltip } from "./Tooltip";
import { observable, autorun } from "mobx";

import { VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import { Suspense, useEffect } from "react";
import { tracker } from "./analytics";
import { ErrorBoundary } from "./ErrorNotice";

import { observer } from "mobx-react-lite";
import "./BugButton.scss";

export function BugButton() {
  return (
    <MaybeBugButtonNux>
      <Tooltip
        trigger="click"
        component={(dismiss) => <BugDropdown dismiss={dismiss} />}
        placement="bottom"
      >
        <VSCodeButton appearance="icon" data-testid="bug-button">
          <Icon icon="bug" />
        </VSCodeButton>
      </Tooltip>
    </MaybeBugButtonNux>
  );
}

export const bugButtonNux = observable.box<string | null>(null);

let start: number | undefined;
let nux: string | null = null;
autorun(() => {
  if (bugButtonNux.get() != null) {
    // starting to show nux
    start = Date.now();
    nux = bugButtonNux.get();
  } else {
    // stopped showing nux by clearing value
    tracker.track("ShowBugButtonNux", {
      extras: {
        nux: nux,
      },
      duration: start == null ? undefined : Date.now() - start,
    });
  }
});

/**
 * Allow other actions to show a new-user ("nux") tooltip on the bug icon.
 * This is useful to explain how to file a bug or opt out.
 */
function MaybeBugButtonNux({ children }: { children: JSX.Element }) {
  const nux = bugButtonNux.get();
  if (nux == null) {
    return children;
  }

  function Nux() {
    return (
      <div className="bug-button-nux">
        {nux}
        <VSCodeButton appearance="icon" onClick={() => bugButtonNux.set(null)}>
          <Icon icon="x" />
        </VSCodeButton>
      </div>
    );
  }
  return (
    <Tooltip trigger="manual" shouldShow component={Nux} placement="bottom">
      {children}
    </Tooltip>
  );
}

const BugDropdown = observer(({ dismiss }: { dismiss: () => void }) => {
  const info = applicationinfo.get();

  useEffect(() => {
    // unset nux if you open the bug menu
    bugButtonNux.set(null);
  }, [bugButtonNux]);

  const AdditionalDebugContent = platform.AdditionalDebugContent;

  return (
    <DropdownFields
      title={<>Help</>}
      icon="bug"
      data-testid="bug-dropdown"
      className="bug-dropdown"
    >
      {info == null ? (
        <Icon icon="loading" />
      ) : (
        <div className="bug-dropdown-version">
          <Copyable
            children={`GTI version ${info.version} (${info.platformName})`}
          />
        </div>
      )}
      <div className="bug-dropdown-actions">
        <VSCodeButton
          appearance="secondary"
          onClick={() => {
            platform.openExternalLink("https://graphite.dev/docs/gti");
          }}
        >
          <Icon icon="book" slot="start" />
          <>View Documentation</>
        </VSCodeButton>
        <FileABug dismissBugDropdown={dismiss} />
        {AdditionalDebugContent && (
          <div className="additional-debug-content">
            <VSCodeDivider />
            <ErrorBoundary>
              <Suspense>
                <AdditionalDebugContent />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </div>
      {/*
      // TODO: enable these debug actions
      <div className="bug-dropdown-debug-actions">
        <VSCodeButton
          appearance="icon"
          onClick={() => {
            // TODO: platform-specific log file action
          }}>
          <Icon icon="go-to-file" slot="start" />

           <>Reveal log file</>
        </VSCodeButton>
        <VSCodeButton
          appearance="icon"
          onClick={() => {
            // TODO: pull all recoil state
          }}>
          <Icon icon="copy" slot="start" />
           <>Copy UI debug information</>
        </VSCodeButton>
      </div> */}
    </DropdownFields>
  );
});

function FileABug(_: { dismissBugDropdown: () => void }) {
  return <OSSFileABug />;
}

function OSSFileABug() {
  return (
    <>
      <VSCodeButton
        appearance="secondary"
        onClick={() => {
          platform.openExternalLink(
            "https://join.slack.com/t/graphite-community/shared_invite/zt-v828g9dz-TIRvlutxTCqgZmxnsO9Knw"
          );
        }}
      >
        <Icon icon="comment-discussion" slot="start" />
        <>Help and Feedback on Slack</>
      </VSCodeButton>
      <VSCodeButton
        appearance="secondary"
        onClick={() => {
          platform.openExternalLink(
            "https://github.com/withgraphite/graphite-cli/issues"
          );
        }}
      >
        <Icon icon="bug" slot="start" />
        <>Report an Issue on GitHub</>
      </VSCodeButton>
    </>
  );
}
