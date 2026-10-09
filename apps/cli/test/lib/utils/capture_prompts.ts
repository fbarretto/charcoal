import { TContext } from '../../../src/lib/context';
import { AbstractScene } from '../scenes/abstract_scene';

// Runs an action in-process with an interactive context whose first prompt
// records its choice values and answers `answer`.
export async function captureSelectorChoices(
  scene: AbstractScene,
  answer: string | boolean,
  action: (context: TContext) => Promise<unknown>
): Promise<string[]> {
  const context = scene.getContext(true);
  let choices: string[] = [];
  context.prompts = (async (question: { choices?: { value: string }[] }) => {
    choices = choices.length
      ? choices
      : (question.choices ?? []).map((c) => c.value);
    return { value: answer, branch: answer };
  }) as unknown as TContext['prompts'];
  const moveCursor = process.stdout.moveCursor;
  const clearLine = process.stdout.clearLine;
  process.stdout.moveCursor = () => true;
  process.stdout.clearLine = () => true;
  try {
    await action(context);
  } finally {
    process.stdout.moveCursor = moveCursor;
    process.stdout.clearLine = clearLine;
  }
  return choices;
}
