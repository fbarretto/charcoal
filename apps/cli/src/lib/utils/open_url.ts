import { spawn } from 'child_process';
import { TContextLite } from '../context';

export const openArgs = {
  open: {
    describe:
      'Open the page in the browser (default). With --no-open, or without a terminal, only print the URL.',
    demandOption: false,
    default: true,
    type: 'boolean',
  },
} as const;

export function browserCommand(platform: NodeJS.Platform): [string, string[]] {
  switch (platform) {
    case 'darwin':
      return ['open', []];
    case 'win32':
      return ['cmd', ['/c', 'start', '""']];
    default:
      return ['xdg-open', []];
  }
}

// Always prints the URL, so it is still reachable when no browser opens.
export function openUrl(
  url: string,
  { open }: { open: boolean },
  context: TContextLite
): void {
  context.splog.info(url);
  if (!open || !context.interactive) {
    return;
  }
  const [command, args] = browserCommand(process.platform);
  const child = spawn(command, [...args, url], {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => undefined);
  child.unref();
}
