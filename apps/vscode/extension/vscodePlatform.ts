import type { Repository } from "@withgraphite/gti-server/src/Repository";
import type { ServerPlatform } from "@withgraphite/gti-server/src/serverPlatform";
import type { Json } from "@withgraphite/gti-shared/typeUtils";
import type {
  AbsolutePath,
  PlatformSpecificClientToServerMessages,
  ServerToClientMessage,
} from "@withgraphite/gti/src/types";

import * as pathModule from "path";
import * as vscode from "vscode";
import { executeVSCodeCommand } from "./commands";

export const VSCodePlatform: ServerPlatform = {
  platformName: "vscode",
  // eslint-disable-next-line
  handleMessageFromClient: async (
    repo: Repository | undefined,
    message: PlatformSpecificClientToServerMessages,
    postMessage: (message: ServerToClientMessage) => void,
    onDispose: (cb: () => unknown) => void
  ) => {
    try {
      switch (message.type) {
        case "platform/openFile": {
          if (repo == null) {
            break;
          }
          const path: AbsolutePath = pathModule.join(
            repo.info.repoRoot,
            message.path
          );
          const uri = vscode.Uri.file(path);
          const editorPromise = vscode.window.showTextDocument(uri);
          const line = message.options?.line;
          if (line != null) {
            const editor = await editorPromise;
            const lineZeroIndexed = line - 1; // vscode uses 0-indexed line numbers
            editor.selections = [
              new vscode.Selection(lineZeroIndexed, 0, lineZeroIndexed, 0),
            ]; // move cursor to line
            editor.revealRange(
              new vscode.Range(lineZeroIndexed, 0, lineZeroIndexed, 0),
              vscode.TextEditorRevealType.InCenterIfOutsideViewport
            ); // scroll to line
          }
          break;
        }
        case "platform/openDiff": {
          if (repo == null) {
            break;
          }
          const path: AbsolutePath = pathModule.join(
            repo.info.repoRoot,
            message.path
          );
          const uri = vscode.Uri.file(path);
          void executeVSCodeCommand(
            "graphite.open-file-diff",
            uri,
            message.comparison
          );
          break;
        }
        case "platform/openExternal": {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        }
        case "platform/confirm": {
          const OKButton = "Ok";
          const result = await vscode.window.showInformationMessage(
            message.message,
            {
              detail: message.details,
              modal: true,
            },
            OKButton
          );
          postMessage({
            type: "platform/confirmResult",
            result: result === OKButton,
          });
          break;
        }
        case "platform/subscribeToAvailableCwds": {
          const postAllAvailableCwds = () =>
            postMessage({
              type: "platform/availableCwds",
              options: (vscode.workspace.workspaceFolders ?? []).map(
                (folder) => folder.uri.fsPath
              ),
            });

          postAllAvailableCwds();
          const dispose =
            vscode.workspace.onDidChangeWorkspaceFolders(postAllAvailableCwds);
          onDispose(() => dispose.dispose());
          break;
        }
        case "platform/setVSCodeConfig": {
          void vscode.workspace
            .getConfiguration()
            .update(
              message.config,
              message.value,
              message.scope === "global"
                ? vscode.ConfigurationTarget.Global
                : vscode.ConfigurationTarget.Workspace
            );
          break;
        }
        case "platform/subscribeToVSCodeConfig": {
          const sendLatestValue = () =>
            postMessage({
              type: "platform/vscodeConfigChanged",
              config: message.config,
              value: vscode.workspace
                .getConfiguration()
                .get<Json>(message.config),
            });
          const dispose = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(message.config)) {
              sendLatestValue();
            }
          });
          sendLatestValue();
          onDispose(() => dispose.dispose());
          break;
        }
        case "platform/executeVSCodeCommand": {
          void vscode.commands.executeCommand(message.command, ...message.args);
          break;
        }
      }
    } catch (err) {
      void vscode.window.showErrorMessage(
        `error handling message ${JSON.stringify(message)}\n${err}`
      );
    }
  },
};
