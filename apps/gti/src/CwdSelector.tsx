import { DropdownField, DropdownFields } from "./DropdownFields";
import { Tooltip } from "./Tooltip";
import { codeReviewProvider } from "./codeReview/CodeReviewInfo";
import { repositoryInfo, serverCwd } from "./serverAPIState";
import { VSCodeBadge, VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { basename } from "@withgraphite/gti-shared/utils";
import { observer } from "mobx-react-lite";

export const CwdSelector = observer(() => {
  const info = repositoryInfo.get();
  if (info?.type !== "success") {
    return null;
  }
  const repoBasename = basename(info.repoRoot);
  return (
    <Tooltip trigger="click" component={CwdSelectorDetails} placement="bottom">
      <VSCodeButton appearance="icon">
        <Icon icon="folder" slot="start" />
        {repoBasename}
      </VSCodeButton>
    </Tooltip>
  );
});

const CwdSelectorDetails = observer(() => {
  const info = repositoryInfo.get();
  const repoRoot = info?.type === "success" ? info.repoRoot : null;
  const provider = codeReviewProvider.get();
  const cwd = serverCwd.get();
  return (
    <DropdownFields title={<>Repository Info</>} icon="folder">
      <DropdownField title={<>Repository root</>}>
        <code>{repoRoot}</code>
      </DropdownField>
      <DropdownField title={<>Current Working Directory</>}>
        <code>{cwd}</code>
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
