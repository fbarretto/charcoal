import type { ThemeColor } from "./theme";
import type { PreferredSubmitCommand } from "./types";
import type { ReactNode } from "react";

import { DropdownField, DropdownFields } from "./DropdownFields";
import { Tooltip } from "./Tooltip";
import { SetConfigOperation } from "./operations/SetConfigOperation";
import platform from "./platform";
import { repositoryInfo, useRunOperation } from "./serverAPIState";
import { themeState } from "./theme";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeLink,
  VSCodeOption,
} from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { unwrap } from "@withgraphite/gti-shared/utils";

import "./SettingsTooltip.scss";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";

export function SettingsGearButton() {
  return (
    <Tooltip trigger="click" component={SettingsDropdown} placement="bottom">
      <VSCodeButton appearance="icon" data-testid="settings-gear-button">
        <Icon icon="gear" />
      </VSCodeButton>
    </Tooltip>
  );
}

const SettingsDropdown = observer(() => {
  const theme = themeState.get();
  const repoInfo = repositoryInfo.get();
  const runOperation = useRunOperation();
  return (
    <DropdownFields
      title={<>Settings</>}
      icon="gear"
      data-testid="settings-dropdown"
    >
      {platform.theme != null ? null : (
        <Setting title={<>Theme</>}>
          <VSCodeDropdown
            value={theme}
            onChange={(event) =>
              themeState.set(
                (event as React.FormEvent<HTMLSelectElement>).currentTarget
                  .value as ThemeColor
              )
            }
          >
            <VSCodeOption value="dark">
              <>Dark</>
            </VSCodeOption>
            <VSCodeOption value="light">
              <>Light</>
            </VSCodeOption>
          </VSCodeDropdown>
        </Setting>
      )}
      {repoInfo?.type !== "success" ? (
        <Icon icon="loading" />
      ) : repoInfo?.codeReviewSystem.type === "github" ? (
        <Setting
          title={<>Preferred Code Review Submit Command</>}
          description={
            <>
              <>
                Which command to use to submit code for code review on GitHub.
              </>{" "}
              <VSCodeLink
                href="https://graphite.dev/docs/creating-and-submitting-pull-requests"
                target="_blank"
              >
                <>Learn More.</>
              </VSCodeLink>
            </>
          }
        >
          <VSCodeDropdown
            value={repoInfo.preferredSubmitCommand ?? "not set"}
            onChange={(event) => {
              const value = (event as React.FormEvent<HTMLSelectElement>)
                .currentTarget.value as PreferredSubmitCommand | "not set";
              if (value === "not set") {
                return;
              }

              runOperation(
                new SetConfigOperation(
                  "local",
                  "github.preferred_submit_command",
                  value
                )
              );
              runInAction(() => {
                const info = repositoryInfo.get();
                if (info?.type === "success") {
                  repositoryInfo.set({
                    ...unwrap(info),
                    preferredSubmitCommand: value,
                  });
                }
              });
            }}
          >
            {repoInfo.preferredSubmitCommand == null ? (
              <VSCodeOption value={"not set"}>(not set)</VSCodeOption>
            ) : null}
            <VSCodeOption value="ghstack">gt stack submit </VSCodeOption>
            <VSCodeOption value="pr">gt branch submit</VSCodeOption>
          </VSCodeDropdown>
        </Setting>
      ) : null}
    </DropdownFields>
  );
});

function Setting({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <DropdownField title={title}>
      {description && <div className="setting-description">{description}</div>}
      {children}
    </DropdownField>
  );
}
