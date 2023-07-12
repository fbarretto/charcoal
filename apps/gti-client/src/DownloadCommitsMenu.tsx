import { DropdownFields } from "./DropdownFields";
import { Tooltip } from "./Tooltip";
import {
  VSCodeButton,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";

import "./DownloadCommitsMenu.scss";
import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import { latestUncommittedChanges, useRunOperation } from "./serverAPIState";
import { observer } from "mobx-react-lite";
import { DownstackGetOperation } from "./operations/DownstackGetOperation";

export const DownloadCommitsTooltipButton = observer(() => {
  const hasUncommittedChanges = latestUncommittedChanges.get().length > 0;

  return (
    <Tooltip
      trigger="click"
      component={(dismiss: () => unknown) => (
        <DownloadCommitsTooltip dismiss={dismiss} />
      )}
      placement="bottom"
      title={"Downstack get"}
    >
      <VSCodeButton
        disabled={hasUncommittedChanges}
        appearance="icon"
        data-testid="download-commits-tooltip-button"
      >
        <Icon icon="cloud-download" />
      </VSCodeButton>
    </Tooltip>
  );
});

const DownloadCommitsTooltip = observer(
  ({ dismiss }: { dismiss: () => unknown }) => {
    const hasUncommittedChanges = latestUncommittedChanges.get().length > 0;

    const [enteredDiffNum, setEnteredDiffNum] = useState("");
    const runOperation = useRunOperation();
    const downloadDiffTextArea = useRef(null);
    useEffect(() => {
      if (downloadDiffTextArea.current) {
        (downloadDiffTextArea.current as HTMLTextAreaElement).focus();
      }
    }, [downloadDiffTextArea]);
    return (
      <DropdownFields
        title={<>Get a branch and its ancestors</>}
        icon="cloud-download"
        data-testid="settings-dropdown"
      >
        <div className="download-commits-input-row">
          <VSCodeTextField
            placeholder={"Branch name..."}
            value={enteredDiffNum}
            onKeyUp={(e) => {
              if (e.key !== "Enter") {
                setEnteredDiffNum(
                  (e.target as unknown as { value: string })?.value ?? ""
                );
              } else if (enteredDiffNum.trim().length > 0) {
                runOperation(new DownstackGetOperation(enteredDiffNum));
                dismiss();
              }
            }}
            ref={downloadDiffTextArea}
          />
          <Tooltip
            title={
              hasUncommittedChanges
                ? "Cannot downstack get with uncommited changes"
                : ""
            }
          >
            <VSCodeButton
              appearance="secondary"
              data-testid="download-commit-button"
              onClick={() => {
                runOperation(new DownstackGetOperation(enteredDiffNum));
              }}
            >
              <>Pull</>
            </VSCodeButton>
          </Tooltip>
        </div>
      </DropdownFields>
    );
  }
);
