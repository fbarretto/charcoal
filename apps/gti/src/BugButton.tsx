import { Copyable } from "./Copyable";
import { DropdownFields } from "./DropdownFields";
import { Tooltip } from "./Tooltip";
import platform from "./platform";
import { applicationinfo } from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./BugButton.scss";
import { observer } from "mobx-react-lite";

export function BugButton() {
  return (
    <Tooltip trigger="click" component={BugDropdown} placement="bottom">
      <VSCodeButton appearance="icon" data-testid="bug-button">
        <Icon icon="bug" />
      </VSCodeButton>
    </Tooltip>
  );
}

const BugDropdown = observer(({ dismiss }: { dismiss: () => void }) => {
  const info = applicationinfo.get();
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
            children={`ISL version ${info.version} (${info.platformName})`}
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
