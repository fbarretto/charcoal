/**
 * The original code was written in recoil, and many of the original
 * callsites used recoil families (either atomFamily or selectorFamily).
 *
 * This code allows you to have a "family" in a more canonically MobX way.
 */

export function family<TArgs, TValue>({
  genKey,
  genValue,
}: {
  genKey: (args: TArgs) => string;
  genValue: (args: TArgs) => TValue;
}): (args: TArgs) => TValue {
  const memo: Record<string, TValue> = {};

  return (args: TArgs) => {
    const key = genKey(args);

    if (!(key in memo)) {
      memo[key] = genValue(args);
    }

    return memo[key];
  };
}
