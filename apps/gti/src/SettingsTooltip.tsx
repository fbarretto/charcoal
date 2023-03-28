import type { ReactNode } from "react";
import type { ThemeColor } from "./theme";

import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
} from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { DropdownField, DropdownFields } from "./DropdownFields";
import platform from "./platform";
import { repositoryInfo, useRunOperation } from "./serverAPIState";
import { themeState } from "./theme";
import { Tooltip } from "./Tooltip";

import { observer } from "mobx-react-lite";
import "./SettingsTooltip.scss";

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
