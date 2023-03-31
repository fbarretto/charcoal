import { action, makeObservable, observable } from "mobx";

/**
 * The original code was written in recoil, and many of the original
 * callsites used recoil effects (https://recoiljs.org/docs/guides/atom-effects/).
 *
 * This library is an adaption layer to allow us to incrementally
 * migrate that code.
 */

type TDisposer = () => void;
type TSetter<T> = (value: T | ((old: T) => T)) => void;
export type TEffect<T> = (args: { setSelf: TSetter<T> }) => TDisposer;

export function observableBoxWithInitializers<T>(args: {
  default: T;
  setter?: (value: T) => void;
  effects?: TEffect<T>[];
}) {
  const box = new BoxWithSetter<T>(args.default, args.setter);

  if (args.effects) {
    for (const effect of args.effects) {
      effect({
        setSelf: box.set,
      });
    }
  }

  return box;
}

class BoxWithSetter<T> {
  value: T;

  constructor(init: T, private setter?: (value: T) => void) {
    this.value = init;

    makeObservable(this, {
      value: observable.ref,
      set: action.bound,
    });
  }

  get() {
    return this.value;
  }

  set(newValue: T | ((old: T) => T)) {
    this.value =
      typeof newValue === "function"
        ? (newValue as (old: T) => T)(this.get())
        : newValue;

    if (this.setter) {
      this.setter(this.value);
    }
  }
}
