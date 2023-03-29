import { Internal } from "@withgraphite/gti-server/src/Internal";
import os from "os";
import * as vscode from "vscode";

/**
 * Determine which command to use for `sl`, based on vscode configuration.
 * Changes to this setting require restarting, so it's ok to cache this value
 * or use it in the construction of a different object.
 */
export function getCLICommand(): string {
  // prettier-disable
  return (
    vscode.workspace.getConfiguration("graphite").get("commandPath") ||
    Internal.SLCommand ||
    (os.platform() === "win32" ? "gt.exe" : "gt")
  );
}
