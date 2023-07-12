import { EventEmitter } from "events";

/**
 * Like {@link EventEmitter}, but with type checking for one particular subscription type,
 * plus errors.
 * ```
 * const myEmitter = new TypedEventEmitter<'data', number>();
 * myEmitter.on('data', (data: number) => ...); // typechecks 'data' param and callback
 * myEmitter.on('error', (error: Error) => ...); // errors are always allowed too
 * // Fields other than 'data' and 'error' are type errors.
 * ```
 */
export declare interface TypedEventEmitter<
  EventName extends string,
  EventType
> {
  on(event: EventName, listener: (data: EventType) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  off(event: EventName, listener: (data: EventType) => void): this;
  off(event: "error", listener: (error: Error) => void): this;

  emit(
    ...args: EventType extends undefined
      ? [event: EventName] | [event: EventName, data: EventType]
      : [event: EventName, data: EventType]
  ): boolean;
  emit(event: "error", error: Error): boolean;
}

export class TypedEventEmitter<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  EventName extends string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  EventType
> extends EventEmitter {}
