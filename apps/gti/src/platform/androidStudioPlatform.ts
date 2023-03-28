import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type { Platform } from "../platform";

declare global {
  interface Window {
    __IdeBridge: {
      openFileInAndroidStudio: (path: string) => void;
      clipboardCopy?: (data: string) => void;
    };
  }
}

// important: this file should not try to import other code from '@withgraphite/gti',
// since it will end up getting duplicated by webpack.

const androidStudioPlatform: Platform = {
  platformName: "androidStudio",

  confirm: (message: string, details?: string) => {
    // TODO: Android Studio-style confirm modal
    const ok = window.confirm(message + "\n" + (details ?? ""));
    return Promise.resolve(ok);
  },

  openFile: (_path: RepoRelativePath) => {
    window.__IdeBridge.openFileInAndroidStudio(_path);
  },

  openExternalLink(_url: string): void {
    window.open(_url, "_blank");
  },

  clipboardCopy(data: string) {
    window.__IdeBridge.clipboardCopy?.(data);
  },
};

window.gtiPlatform = androidStudioPlatform;
