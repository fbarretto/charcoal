import { FlexRow } from "./ComponentUtils";
import { Tooltip } from "./Tooltip";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { useContextMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import { observableConfig } from "./config_observable";
import { observer } from "mobx-react-lite";

export type ChangedFilesDisplayType = "short" | "fullPaths" | "tree" | "fish";

export const changedFilesDisplayType =
  observableConfig<ChangedFilesDisplayType>({
    config: "gti.changedFilesDisplayType",
    default: "short",
  });

type ChangedFileDisplayTypeOption = { icon: string; label: JSX.Element };
const ChangedFileDisplayTypeOptions: Record<
  ChangedFilesDisplayType,
  ChangedFileDisplayTypeOption
> = {
  short: { icon: "list-selection", label: <>Short file names</> },
  fullPaths: { icon: "menu", label: <>Full file paths</> },
  tree: { icon: "list-tree", label: <>Tree</> },
  fish: { icon: "whole-word", label: <>One-letter directories</> },
};
const entries = Object.entries(ChangedFileDisplayTypeOptions) as Array<
  [ChangedFilesDisplayType, ChangedFileDisplayTypeOption]
>;

export const ChangedFileDisplayTypePicker = observer(() => {
  const displayType = changedFilesDisplayType.get();

  const actions = entries.map(([type, options]) => ({
    label: (
      <FlexRow>
        <Icon icon={displayType === type ? "check" : "blank"} slot="start" />
        <Icon icon={options.icon} slot="start" />
        {options.label}
      </FlexRow>
    ),
    onClick: () => changedFilesDisplayType.set(type),
  }));
  const contextMenu = useContextMenu(() => actions);

  return (
    <Tooltip title={"Change how file paths are displayed"}>
      <VSCodeButton
        appearance="icon"
        className="changed-file-display-type-picker"
        data-testid="changed-file-display-type-picker"
        onClick={contextMenu}
      >
        <Icon icon={ChangedFileDisplayTypeOptions[displayType].icon} />
      </VSCodeButton>
    </Tooltip>
  );
});
