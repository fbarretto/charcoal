import type { ApplicationInfo } from "./types";

import os from "os";
import { randomId, unwrap } from "@withgraphite/gti-shared/utils";

export function getUsername(): string {
  try {
    return os.userInfo().username;
  } catch (osInfoError) {
    try {
      const { env } = process;
      return unwrap(env.LOGNAME || env.USER || env.LNAME || env.USERNAME);
    } catch (processEnvError) {
      throw new Error(String(processEnvError) + String(osInfoError));
    }
  }
}

export function generateAnalyticsInfo(
  platformName: string,
  version: string
): ApplicationInfo {
  return {
    platform: platformName,
    version,
    repo: undefined,
    /**
     * Random id for this GTI session, created at startup.
     * Note: this is only generated on the server, so client-logged events share the ID with the server.
     */
    sessionId: randomId(),
    unixname: getUsername(),
    osArch: os.arch(),
    osType: os.platform(),
    osRelease: os.release(),
    hostname: os.hostname(),
  };
}
