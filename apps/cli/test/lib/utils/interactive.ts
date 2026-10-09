import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';

// Optional prompts only fire on a TTY (see canPrompt).
export async function withTTY<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.stdin.isTTY;
  process.stdin.isTTY = true;
  try {
    return await fn();
  } finally {
    process.stdin.isTTY = original;
  }
}

// Points GIT_EDITOR at a script that writes `message` into the edited file,
// first copying the template git offered to `capture` if given.
export function withEditor<T>(
  message: string,
  fn: () => T,
  capture = '/dev/null'
): T {
  const original = process.env.GIT_EDITOR;
  const script = path.join(tmp.dirSync().name, 'editor.sh');
  fs.writeFileSync(
    script,
    `#!/bin/sh\ncp "$1" '${capture}'\nprintf '%s\\n' '${message}' > "$1"\n`
  );
  fs.chmodSync(script, 0o755);
  process.env.GIT_EDITOR = script;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.GIT_EDITOR;
    } else {
      process.env.GIT_EDITOR = original;
    }
  }
}
