import type { Logger } from "@withgraphite/gti-server/src/logger";

import { watchAndCreateRepositoriesForWorkspaceFolders } from "./VSCodeRepo";
import { registerGTICommands } from "./gtiWebviewPanel";
import * as util from "util";
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  const [outputChannel, logger] = createOutputChannelLogger();
  context.subscriptions.push(registerGTICommands(context, logger));
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    watchAndCreateRepositoriesForWorkspaceFolders(logger)
  );
}

function createOutputChannelLogger(): [vscode.OutputChannel, Logger] {
  const outputChannel = vscode.window.createOutputChannel("Graphite GTI");
  const log = (...data: Array<unknown>) =>
    outputChannel.appendLine(util.format(...data));
  const outputChannelLogger = {
    log,
    info: log,
    warn: log,
    error: log,
  } as Logger;
  return [outputChannel, outputChannelLogger];
}
