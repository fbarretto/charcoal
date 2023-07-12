export interface Logger {
  info(...args: Parameters<typeof console.info>): void;
  log(...args: Parameters<typeof console.log>): void;
  warn(...args: Parameters<typeof console.warn>): void;
  error(...args: Parameters<typeof console.error>): void;

  getLogFileContents?: () => Promise<string>;
}
