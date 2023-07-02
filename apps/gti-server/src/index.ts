import type { Logger } from "./logger";
import type { ServerPlatform } from "./serverPlatform";

import { makeServerSideTracker } from "./analytics/serverSideTracker";
import { fileLogger, stdoutLogger } from "./logger";
import { browserServerPlatform } from "./serverPlatform";
import ServerToClientAPI from "./ServerToClientAPI";

export interface ClientConnection {
  /**
   * Used to send a message from the server to the client.
   *
   * Designed to match
   * https://code.visualstudio.com/api/references/vscode-api#Webview.postMessage
   */
  postMessage(message: string): Promise<boolean>;

  /**
   * Designed to match
   * https://code.visualstudio.com/api/references/vscode-api#Webview.onDidReceiveMessage
   */
  onDidReceiveMessage(
    hander: (event: Buffer, isBinary: boolean) => void | Promise<void>
  ): {
    dispose(): void;
  };

  /**
   * Which command to use to run `gt`
   */
  command?: string;
  /**
   * Platform-specific version string.
   * For `gt interactive web`, this is the `gt` version.
   * For the VS Code extension, this is the extension version.
   */
  version: string;
  logFileLocation?: string;
  logger?: Logger;
  cwd: string;

  platform?: ServerPlatform;
}

export function onClientConnection(connection: ClientConnection): () => void {
  const logger =
    connection.logger ??
    (connection.logFileLocation
      ? fileLogger(connection.logFileLocation)
      : stdoutLogger);
  connection.logger = logger;
  const platform = connection?.platform ?? browserServerPlatform;
  const version = connection?.version ?? "unknown";
  logger.log(`establish client connection for ${connection.cwd}`);
  logger.log(`platform '${platform.platformName}', version '${version}'`);

  const tracker = makeServerSideTracker(logger, platform, version);
  tracker.track("ClientConnection", { extras: { cwd: connection.cwd } });

  // start listening to messages
  let api: ServerToClientAPI | null = new ServerToClientAPI(
    platform,
    connection,
    tracker,
    logger
  );
  api.setActiveRepoForCwd(connection.cwd);

  return () => {
    api?.dispose();
    api = null;
  };
}
