import { VSCodeBadge, VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { basename } from "@withgraphite/gti-shared/utils";
import { observer } from "mobx-react-lite";
import { codeReviewProvider } from "./codeReview/CodeReviewInfo";
import { DropdownField, DropdownFields } from "./DropdownFields";
import { repositoryInfo, serverCwd } from "./serverAPIState";
import { Tooltip } from "./Tooltip";

import {
  VSCodeDivider,
  VSCodeRadio,
  VSCodeRadioGroup,
} from "@vscode/webview-ui-toolkit/react";
import { minimalDisambiguousPaths } from "@withgraphite/gti-shared/minimalDisambiguousPaths";
import serverAPI from "./ClientToServerAPI";
import { observableBoxWithInitializers } from "./lib/mobx-recoil/observable_box_with_init";

export const availableCwds = observableBoxWithInitializers<string[]>({
  default: [],
  effects: [
    ({ setSelf }) => {
      const disposable = serverAPI.onMessageOfType(
        "platform/availableCwds",
        (event) => {
          setSelf(event.options);
        }
      );
      return () => disposable.dispose();
    },

    () =>
      serverAPI.onConnectOrReconnect(() =>
        serverAPI.postMessage({
          type: "platform/subscribeToAvailableCwds",
        })
      ),
  ],
});

export const CwdSelector = observer(() => {
  const info = repositoryInfo.get();
  if (info?.type !== "success") {
    return null;
  }
  const repoBasename = basename(info.repoRoot);
  return (
    <Tooltip
      trigger="click"
      component={() => <CwdDetails />}
      placement="bottom"
    >
      <VSCodeButton appearance="icon" data-testid="cwd-dropdown-button">
        <Icon icon="folder" slot="start" />
        {repoBasename}
      </VSCodeButton>
    </Tooltip>
  );
});

const CwdDetails = observer(() => {
  const info = repositoryInfo.get();
  const repoRoot = info?.type === "success" ? info.repoRoot : null;
  const provider = codeReviewProvider.get();
  const cwd = serverCwd.get();
  return (
    <DropdownFields
      title={<>Repository Info</>}
      icon="folder"
      data-testid="cwd-details-dropdown"
    >
      <CwdSelections />
      <DropdownField title={<>Active repository</>}>
        <code>{cwd}</code>
      </DropdownField>
      <DropdownField title={<>Repository Root</>}>
        <code>{repoRoot}</code>
      </DropdownField>
      {provider != null ? (
        <DropdownField title={<>Code Review Provider</>}>
          <span>
            <VSCodeBadge>{provider?.name}</VSCodeBadge> <provider.RepoInfo />
          </span>
        </DropdownField>
      ) : null}
    </DropdownFields>
  );
});

const CwdSelections = observer(() => {
  const currentCwd = serverCwd.get();
  const cwdOptions = availableCwds.get();
  if (cwdOptions.length < 2) {
    return null;
  }

  const paths = minimalDisambiguousPaths(cwdOptions);

  return (
    <DropdownField title={<>Change active repository</>}>
      <VSCodeRadioGroup
        orientation="vertical"
        value={currentCwd}
        onChange={(e) => {
          const newCwd = (e.target as HTMLOptionElement).value as string;
          if (newCwd === currentCwd) {
            // nothing to change
            return;
          }
          serverAPI.postMessage({
            type: "changeCwd",
            cwd: newCwd,
          });
          serverAPI.cwdChanged();
        }}
      >
        {paths.map((shortCwd, index) => {
          const fullCwd = cwdOptions[index];
          return (
            <VSCodeRadio
              key={shortCwd}
              value={fullCwd}
              checked={fullCwd === currentCwd}
              tabIndex={0}
            >
              <Tooltip key={shortCwd} title={fullCwd} placement="right">
                {shortCwd}
              </Tooltip>
            </VSCodeRadio>
          );
        })}
      </VSCodeRadioGroup>
      <VSCodeDivider />
    </DropdownField>
  );
});
