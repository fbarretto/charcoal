import type { Logger } from "@withgraphite/gti-server/src/logger";

import * as packageJson from "../package.json";
import { getCLICommand } from "./config";
import { VSCodePlatform } from "./vscodePlatform";
import { onClientConnection } from "@withgraphite/gti-server/src";
import { unwrap } from "@withgraphite/gti-shared/utils";
import * as vscode from "vscode";

let gtiPanel: vscode.WebviewPanel | undefined = undefined;

const viewType = "graphite.gti";

export function createOrFocusISLWebview(
  context: vscode.ExtensionContext,
  logger: Logger
): vscode.WebviewPanel {
  // Try to re-use existing ISL panel
  if (gtiPanel) {
    gtiPanel.reveal();
    return gtiPanel;
  }
  // Otherwise, create a new panel

  const column =
    vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  gtiPanel = populateAndSetISLWebview(
    context,
    vscode.window.createWebviewPanel(
      viewType,
      "Graphite interactive",
      column,
      getWebviewOptions(context)
    ),
    logger
  );
  return unwrap(gtiPanel);
}

function getWebviewOptions(
  context: vscode.ExtensionContext
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: true,
    // Restrict the webview to only loading content from our extension's `webview` directory.
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, "dist/webview"),
    ],
  };
}

export function registerGTICommands(
  context: vscode.ExtensionContext,
  logger: Logger
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand("graphite.open-gti", () => {
      try {
        createOrFocusISLWebview(context, logger);
      } catch (err: unknown) {
        void vscode.window.showErrorMessage(`error opening gti: ${err}`);
      }
    }),
    registerDeserializer(context, logger)
  );
}

function registerDeserializer(
  context: vscode.ExtensionContext,
  logger: Logger
) {
  // Make sure we register a serializer in activation event
  return vscode.window.registerWebviewPanelSerializer(viewType, {
    deserializeWebviewPanel(
      webviewPanel: vscode.WebviewPanel,
      _state: unknown
    ) {
      // Reset the webview options so we use latest uri for `localResourceRoots`.
      webviewPanel.webview.options = getWebviewOptions(context);
      populateAndSetISLWebview(context, webviewPanel, logger);
      return Promise.resolve();
    },
  });
}

function populateAndSetISLWebview(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  logger: Logger
): vscode.WebviewPanel {
  logger.info("Populating GTI webview panel");
  gtiPanel = panel;
  panel.webview.html = htmlForISLWebview(context, panel.webview);
  panel.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "graphite-favicon.svg"
  );

  logger.log("populate gti webview");
  const disposeConnection = onClientConnection({
    postMessage(message: string) {
      return panel.webview.postMessage(message) as Promise<boolean>;
    },
    onDidReceiveMessage(handler) {
      return panel.webview.onDidReceiveMessage((m) => {
        void handler(m);
      });
    },
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), // TODO
    platform: VSCodePlatform,
    logger,
    command: getCLICommand(),
    version: packageJson.version,
  });

  panel.onDidDispose(() => {
    logger.info("Disposing GTI panel");
    gtiPanel = undefined;
    disposeConnection();
  });

  return gtiPanel;
}

function htmlForISLWebview(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
) {
  // Only allow accessing resources relative to webview dir,
  // and make paths relative to here.
  const baseUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "dist", "webview")
  );

  const scriptUri = "gti.js";
  const stylesMainUri = "gti.css";

  // Use a nonce to only allow specific scripts to be run
  const nonce = getNonce();

  const loadingText = "Loading...";
  const titleText = "Graphite interactive";

  const CSP = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    // vscode-webview-ui needs to use style-src-elem without the nonce
    `style-src-elem ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} https: data:`,
    `script-src 'nonce-${nonce}'`,
    `script-src-elem 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta http-equiv="Content-Security-Policy" content="${CSP}">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<base href="${baseUri}/">
		<title>${titleText}</title>
		<link href="${stylesMainUri}" rel="stylesheet">
		<script nonce="${nonce}">
      window.webpackNonce = "${nonce}";
		</script>
		<script defer="defer" nonce="${nonce}" src="${scriptUri}"></script>
	</head>
	<body>
		<div id="root">${loadingText}</div>
	</body>
	</html>`;
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
