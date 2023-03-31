import type { Logger } from "@withgraphite/gti-server/src/logger";

import { watchAndCreateRepositoriesForWorkspaceFolders } from "./VSCodeRepo";
import { registerGTICommands } from "./gtiWebviewPanel";
import * as util from "util";
import * as vscode from "vscode";
import packageJson from "../package.json";
import { VSCodePlatform } from "./vscodePlatform";
import { makeServerSideTracker } from "@withgraphite/gti-server/src/analytics/serverSideTracker";
import { registerCommands } from "./commands";
import { registerGraphiteDiffContentProvider } from "./DiffContentProvider";

export async function activate(context: vscode.ExtensionContext) {
  const start = Date.now();
  const [outputChannel, logger] = createOutputChannelLogger();
  const extensionTracker = makeServerSideTracker(
    logger,
    VSCodePlatform,
    packageJson.version
  );
  try {
    context.subscriptions.push(registerGTICommands(context, logger));
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(
      watchAndCreateRepositoriesForWorkspaceFolders(logger)
    );
    context.subscriptions.push(registerGraphiteDiffContentProvider(logger));
    context.subscriptions.push(...registerCommands(extensionTracker));
    extensionTracker.track("VSCodeExtensionActivated", {
      duration: Date.now() - start,
    });
  } catch (error) {
    extensionTracker.error(
      "VSCodeExtensionActivated",
      "VSCodeActivationError",
      error as Error,
      {
        duration: Date.now() - start,
      }
    );
  }
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
