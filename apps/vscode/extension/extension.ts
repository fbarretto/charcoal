import type { Logger } from "@withgraphite/gti-server/src/logger";

import { makeServerSideTracker } from "@withgraphite/gti-server/src/analytics/serverSideTracker";
import * as util from "util";
import * as vscode from "vscode";
import packageJson from "../package.json";
import { registerCommands } from "./commands";
import { registerGraphiteDiffContentProvider } from "./DiffContentProvider";
import { registerGTICommands } from "./gtiWebviewPanel";
import { VSCodePlatform } from "./vscodePlatform";
import { watchAndCreateRepositoriesForWorkspaceFolders } from "./VSCodeRepo";

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

const logFileContents: Array<string> = [];
function createOutputChannelLogger(): [vscode.OutputChannel, Logger] {
  const outputChannel = vscode.window.createOutputChannel("Graphite GTI");
  const log = (...data: Array<unknown>) => {
    const line = util.format(...data);
    logFileContents.push(line);
    outputChannel.appendLine(line);
  };
  const outputChannelLogger = {
    log,
    info: log,
    warn: log,
    error: log,

    getLogFileContents() {
      return Promise.resolve(logFileContents.join("\n"));
    },
  } as Logger;
  return [outputChannel, outputChannelLogger];
}
