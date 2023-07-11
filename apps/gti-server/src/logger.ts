import fs from "fs";
import util from "util";
import type { Logger } from "@withgraphite/gti-shared";

export const stdoutLogger = console;

export function fileLogger(filename: string): Logger {
  const log = (...args: Parameters<typeof console.log>) => {
    const str = util.format(...args) + "\n";
    void fs.promises.appendFile(filename, str);
  };

  return {
    info: log,
    log,
    warn: log,
    error: log,

    getLogFileContents: () => {
      return fs.promises.readFile(filename, "utf-8");
    },
  };
}
