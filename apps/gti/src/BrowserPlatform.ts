import type { Platform } from "./platform";
import type { RepoRelativePath } from "./types";

import serverAPI from "./ClientToServerAPI";

export const browserPlatform: Platform = {
  platformName: "browser",
  confirm: (message: string, details?: string) => {
    const ok = window.confirm(message + "\n" + (details ?? ""));
    return Promise.resolve(ok);
  },

  openFile: (path: RepoRelativePath) => {
    serverAPI.postMessage({ type: "platform/openFile", path });
  },

  openExternalLink(url: string): void {
    window.open(url, "_blank");
  },

  clipboardCopy(data: string): void {
    void navigator.clipboard.writeText(data);
  },
};
