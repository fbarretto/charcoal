import type { ThemeColor } from "./theme";
import type { Disposable, OneIndexedLineNumber, PlatformName } from "./types";

import type { LazyExoticComponent } from "react";
import type { Comparison } from "@withgraphite/gti-shared/Comparison";
import { browserPlatform } from "./BrowserPlatform";
import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";

export type InitialParamKeys = "token" | string;

/**
 * Platform-specific API for each target: vscode extension, electron standalone, browser, ...
 */
export interface Platform {
  platformName: PlatformName;
  confirm(message: string, details?: string): Promise<boolean>;
  openFile(
    path: RepoRelativePath,
    options?: { line?: OneIndexedLineNumber }
  ): void;
  openDiff?(path: RepoRelativePath, comparison: Comparison): void;
  openExternalLink(url: string): void;
  clipboardCopy(value: string): void;

  /**
   * Component representing additional buttons/info in the help menu.
   * Note: This should be lazy-loaded via `React.lazy()` so that implementations
   * may import any files without worrying about the platform being set up yet or not.
   */
  AdditionalDebugContent?: LazyExoticComponent<() => JSX.Element>;
  /**
   * Content to show in splash screen when starting GTI for the first time.
   * Note: This should be lazy-loaded via `React.lazy()` so that implementations
   * may import any files without worrying about the platform being set up yet or not.
   */
  GettingStartedContent?: LazyExoticComponent<
    ({ dismiss }: { dismiss: () => void }) => JSX.Element
  >;
  /** Content to show as a tooltip on the bug button after going through the getting started experience */
  GettingStartedBugNuxContent?: string;

  theme?: {
    getTheme(): ThemeColor;
    onDidChangeTheme(callback: (theme: ThemeColor) => unknown): Disposable;
  };
}

declare global {
  interface Window {
    gtiPlatform?: Platform;
  }
}

// Non-browser platforms are defined by setting window.gtiPlatform
// before the main GTI script loads.
const foundPlatform = window.gtiPlatform ?? browserPlatform;
window.gtiPlatform = foundPlatform;

export default foundPlatform;
