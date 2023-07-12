

import type {ValueObject} from 'immutable';

/** Wraps a ValueObject so it self-updates on equals. */
export class SelfUpdate<T extends ValueObject> implements ValueObject {
  inner: T;

  constructor(inner: T) {
    this.inner = inner;
  }

  hashCode(): number {
    return this.inner.hashCode() + 1;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof SelfUpdate<T>)) {
      return false;
    }
    if (this === other) {
      return true;
    }
    const otherInner = other.inner;
    const result = this.inner.equals(otherInner);
    if (result && this.inner !== otherInner) {
      this.inner = otherInner;
    }
    return result;
  }
}
