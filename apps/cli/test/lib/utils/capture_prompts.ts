import { TContext } from '../../../src/lib/context';
import { AbstractScene } from '../scenes/abstract_scene';

type TChoice = { title: string; value: string };

// Runs an action in-process with an interactive context. The nth prompt is
// answered with answers[n]; returns the choices each prompt offered.
export async function capturePrompts(
  scene: AbstractScene,
  answers: Array<string | boolean>,
  action: (context: TContext) => Promise<unknown>
): Promise<TChoice[][]> {
  const context = scene.getContext(true);
  const offered: TChoice[][] = [];
  context.prompts = (async (question: { choices?: TChoice[] }) => {
    const answer = answers[offered.length];
    offered.push(question.choices ?? []);
    return { value: answer, branch: answer };
  }) as unknown as TContext['prompts'];
  const { moveCursor, clearLine } = process.stdout;
  process.stdout.moveCursor = () => true;
  process.stdout.clearLine = () => true;
  try {
    await action(context);
  } finally {
    process.stdout.moveCursor = moveCursor;
    process.stdout.clearLine = clearLine;
  }
  return offered;
}

export const choiceValues = (choices: TChoice[]): string[] =>
  choices.map((c) => c.value).sort();
