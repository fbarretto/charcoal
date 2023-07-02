import type { Logger } from "@withgraphite/gti-server/src/logger";

import * as packageJson from "../package.json";
import { getCLICommand } from "./config";
import { VSCodePlatform } from "./vscodePlatform";
import { onClientConnection } from "@withgraphite/gti-server/src";
import { unwrap } from "@withgraphite/gti-shared/utils";
import * as vscode from "vscode";
import { executeVSCodeCommand } from "./commands";

let gtiPanelOrView: vscode.WebviewView | vscode.WebviewPanel | undefined =
  undefined;

const viewType = "graphite.gti";

function createOrFocusGTIWebview(
  context: vscode.ExtensionContext,
  logger: Logger
): vscode.WebviewView | vscode.WebviewPanel {
  // Try to re-use existing GTI panel
  if (gtiPanelOrView) {
    isPanel(gtiPanelOrView) ? gtiPanelOrView.reveal() : gtiPanelOrView.show();
    return gtiPanelOrView;
  }
  // Otherwise, create a new panel/view

  const column =
    vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  gtiPanelOrView = populateAndSetGTIWebview(
    context,
    vscode.window.createWebviewPanel(
      viewType,
      "Graphite interactive",
      column,
      getWebviewOptions(context)
    ),
    logger
  );
  return unwrap(gtiPanelOrView);
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

function shouldUseWebviewView(): boolean {
  return (
    vscode.workspace
      .getConfiguration("graphite.gti")
      .get<boolean>("showInSidebar") ?? false
  );
}

export function registerGTICommands(
  context: vscode.ExtensionContext,
  logger: Logger
): vscode.Disposable {
  const webviewViewProvider = new GTIWebviewViewProvider(context, logger);
  return vscode.Disposable.from(
    vscode.commands.registerCommand("graphite.open-gti", () => {
      try {
        if (shouldUseWebviewView()) {
          // just open the sidebar view
          void executeVSCodeCommand("graphite.gti.focus");
          return;
        }
        createOrFocusGTIWebview(context, logger);
      } catch (err: unknown) {
        void vscode.window.showErrorMessage(`error opening gti: ${err}`);
      }
    }),
    vscode.commands.registerCommand("sapling.close-gti", () => {
      if (!gtiPanelOrView) {
        return;
      }
      if (isPanel(gtiPanelOrView)) {
        gtiPanelOrView.dispose();
      } else {
        // close sidebar entirely
        void executeVSCodeCommand("workbench.action.closeSidebar");
      }
    }),
    registerDeserializer(context, logger),
    vscode.window.registerWebviewViewProvider(viewType, webviewViewProvider),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // if we start using GTI as a view, dispose the panel
      if (e.affectsConfiguration("graphite.gti.showInSidebar")) {
        if (
          gtiPanelOrView &&
          isPanel(gtiPanelOrView) &&
          shouldUseWebviewView()
        ) {
          gtiPanelOrView.dispose();
        }
      }
    })
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
      if (shouldUseWebviewView()) {
        // if we try to deserialize a panel while we're trying to use view, destroy the panel and open the sidebar instead
        webviewPanel.dispose();
        void executeVSCodeCommand("graphite.gti.focus");
        return Promise.resolve();
      }
      // Reset the webview options so we use latest uri for `localResourceRoots`.
      webviewPanel.webview.options = getWebviewOptions(context);
      populateAndSetGTIWebview(context, webviewPanel, logger);
      return Promise.resolve();
    },
  });
}

/**
 * Provides the GTI webview contents as a VS Code Webview View, aka a webview that lives in the sidebar/bottom
 * rather than an editor pane. We always register this provider, even if the user doesn't have the config enabled
 * that shows this view.
 */
class GTIWebviewViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private extensionContext: vscode.ExtensionContext,
    private logger: Logger
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = getWebviewOptions(this.extensionContext);
    populateAndSetGTIWebview(this.extensionContext, webviewView, this.logger);
  }
}

function isPanel(
  panelOrView: vscode.WebviewPanel | vscode.WebviewView
): panelOrView is vscode.WebviewPanel {
  // panels have a .reveal property, views have .show
  return (panelOrView as vscode.WebviewPanel).reveal !== undefined;
}

function populateAndSetGTIWebview<
  W extends vscode.WebviewPanel | vscode.WebviewView
>(
  context: vscode.ExtensionContext,
  panelOrView: W,
  logger: Logger
): vscode.WebviewPanel | vscode.WebviewView {
  logger.info(
    `Populating GTI webview ${isPanel(panelOrView) ? "panel" : "view"}`
  );
  if (isPanel(panelOrView)) {
    gtiPanelOrView = panelOrView;
    panelOrView.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "resources",
      "graphite-favicon.svg"
    );
  }
  panelOrView.webview.html = htmlForGTIWebview(
    context,
    panelOrView.webview,
    isPanel(panelOrView) ? "panel" : "view"
  );

  logger.log("populate gti webview");
  const disposeConnection = onClientConnection({
    postMessage(message: string) {
      return panelOrView.webview.postMessage(message) as Promise<boolean>;
    },
    onDidReceiveMessage(handler) {
      return panelOrView.webview.onDidReceiveMessage((m) => {
        const isBinary = m instanceof ArrayBuffer;
        void handler(m, isBinary);
      });
    },
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), // TODO
    platform: VSCodePlatform,
    logger,
    command: getCLICommand(),
    version: packageJson.version,
  });

  panelOrView.onDidDispose(() => {
    if (isPanel(panelOrView)) {
      logger.info("Disposing GTI panel");
      gtiPanelOrView = undefined;
    } else {
      logger.info("Disposing GTI view");
    }
    disposeConnection();
  });

  return panelOrView;
}

function htmlForGTIWebview(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  kind: "panel" | "view"
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

  const extraRootClass = `webview-${kind}`;

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
		<div id="root" class="${extraRootClass}">${loadingText}</div>
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
