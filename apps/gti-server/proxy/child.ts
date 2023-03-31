/**
 * This file is expected to be run via child_process.fork() where:
 *
 * - The arguments to `startServer()` are JSON-serialized as the value
 *   of the GTI_SERVER_ARGS environment variable.
 * - Communication to the parent process must be done via process.send()
 *   and the parent process expects messages that conform to
 *   `ChildProcessResponse`.
 */

import type { StartServerArgs, StartServerResult } from "./server";

import * as fs from "fs";

/**
 * This defines the shape of the messages that the parent process accepts.
 * As such, it is imperative that these types are serializable.
 */
export type ChildProcessResponse =
  | {
      type: "message";
      args: Parameters<typeof console.log>;
    }
  | {
      type: "result";
      result: StartServerResult;
    };

function sendMessageToParentProcess(msg: ChildProcessResponse): void {
  process.send?.(msg, undefined, { swallowErrors: true });
}

function info(...args: Parameters<typeof console.log>): void {
  const msg = {
    type: "message",
    args,
  } as ChildProcessResponse;
  sendMessageToParentProcess(msg);
}

const args: StartServerArgs = JSON.parse(process.env.GTI_SERVER_ARGS as string);
args.logInfo = info;
import("./server")
  .then(({ startServer }) => startServer(args))
  .then((result: StartServerResult) => {
    sendMessageToParentProcess({ type: "result", result });
  })
  .catch((error) =>
    sendMessageToParentProcess({
      type: "result",
      result: { type: "error", error: String(error) },
    })
  );

process.on("uncaughtException", (err) => {
  const { logFileLocation } = args;
  void fs.promises.appendFile(
    logFileLocation,
    `\n[${new Date().toString()}] GTI server child process got an uncaught exception:\n${
      err?.stack ?? err?.message
    }\n\n`,
    "utf8"
  );
});
