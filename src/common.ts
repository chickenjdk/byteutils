import { EventEmitter } from "stream";
import { AwaitedUnion, MaybePromise } from "./types";
// Buffers for converting numbers!
export const float32Array = new Float32Array(1);
export const uint8Float32ArrayView = new Uint8Array(float32Array.buffer);
export const float64Array = new Float64Array(1);
export const uint8Float64ArrayView = new Uint8Array(float64Array.buffer);
float32Array[0] = 2;
export const isBigEndian = uint8Float32ArrayView[0] === 64;
// Common helpers
// Binary helpers
/**
 * Join uint8arrays together
 * @param arrays The uint8arrays to join
 * @param totalLength The total length of the arrays. Please provide if known as an optimization.
 * If not provided, it will be calculated by summing the lengths of the arrays.
 * @returns The joined uint8array
 */
export function joinUint8Arrays(
  arrays: Uint8Array[],
  totalLength?: number,
): Uint8Array {
  totalLength ??= arrays.reduce((acc, arr) => acc + arr.length, 0);
  const joined = new Uint8Array(totalLength);
  let index = 0;
  for (const buffer of arrays) {
    joined.set(buffer, index);
    index += buffer.length;
  }
  return joined;
}
// Misc helpers
/**
 * Extend the provided readable/writable buffer to set a default endianness
 * @param buffer The buffer to extend
 * @param isLe If to make the default endianness Little Endian
 */
export function addDefaultEndianness<
  classType extends new (...args: any[]) => { isLe: boolean },
>(buffer: classType, isLe: boolean): classType {
  return class extends buffer {
    constructor(...args: any[]) {
      super(...args);
      this.isLe = isLe;
    }
  };
}
// Promise helpers
export function isThenable(value: any): value is PromiseLike<unknown> {
  // @ts-ignore
  return typeof value?.then === "function";
}
/**
 * Wrap a value for the completion of a promise
 * @param awaiter The value to await (may not actually be a promise, if not returns value with no wrapping)
 * @param value The value to return
 */
export function wrapForPromise<
  awaiter extends Promise<unknown> | unknown,
  value extends unknown,
>(
  awaiter: awaiter,
  value: value,
): awaiter extends PromiseLike<unknown> ? Promise<value> : value {
  if (isThenable(awaiter)) {
    // @ts-ignore
    return awaiter.then(() => value);
  } else {
    // @ts-ignore
    return value;
  }
}
/**
 * Wrap a value for the completion of a promise
 * @param awaiter The value to await (may not actually be a promise, if not returns value with no wrapping)
 * @param value The value to return
 */
export function wrapForAsyncCallArr<
  func extends (...args: args) => unknown,
  value extends unknown,
  args extends unknown[],
>(
  func: func,
  params: args[],
  value: value,
): ReturnType<func> extends Promise<unknown> ? Promise<value> : value {
  for (let index = 0; index < params.length; index++) {
    const output = func(...params[index]);
    if (isThenable(output)) {
      // @ts-ignore
      return (async (params: args[]) => {
        await output;
        for (const value of params) {
          await func(...value);
        }
        return value;
      })(params.slice(index));
    }
  }
  // @ts-ignore
  return value;
}
/**
 * A function to help with processing values that may or may not be promises
 * @param maybePromise The value that may or may not be a promise
 * @param callback The callback to call with the value returned when the promise is resolved or when the value is returned directly.
 * @returns Whet the callback returns, if the input is a promise, it will return a promise that resolves to the value returned by the callback.
 * If the input is not a promise, it will return the value returned by the callback directly.
 */
export function maybePromiseThen<
  maybePromise extends Promise<unknown> | unknown,
  returnType,
>(
  maybePromise: maybePromise,
  callback: (
    value: maybePromise extends PromiseLike<unknown>
      ? Awaited<maybePromise>
      : maybePromise,
  ) => returnType,
): maybePromise extends PromiseLike<unknown>
  ? Promise<returnType>
  : returnType {
  if (isThenable(maybePromise)) {
    // @ts-ignore
    return maybePromise.then(callback);
  } else {
    // @ts-ignore
    return callback(maybePromise);
  }
}
/**
 * Call a function that may or may not return a promise for each set of parameters, if any of the calls return a promise, it will return a promise that resolves to an array of the results.
 * If all calls return values directly, it will return an array of the results directly.
 * @param maybeAsyncFunc A function that may or may not return a promise
 * @param params The array of parameters to call the function with
 * @returns The results of the calls, either as an array of values or a promise that resolves to an array of values. See main description.
 */
export function maybeAsyncCallArr<args extends unknown[], ret>(
  maybeAsyncFunc: (...args: args) => ret,
  params: args[],
): ret extends Promise<unknown> ? Promise<AwaitedUnion<ret>[]> : ret[] {
  const outputs: ret[] = [];
  for (let index = 0; index < params.length; index++) {
    const output = maybeAsyncFunc(...params[index]);
    if (isThenable(output)) {
      // @ts-ignore
      return (async (params: args[]) => {
        outputs.push(await output);
        for (const value of params) {
          outputs.push(await maybeAsyncFunc(...value));
        }
        return outputs;
      })(params.slice(index));
    }
  }
  // @ts-ignore
  return outputs;
}
/**
 * Like a while loop, but calls a callback each repetition.
 * Returns a promise that resolves when the loop finishes if the callback is async,
 * and runs normally if it is not async.
 * Avoids stack overflow by using a loop, not recursive callbacks
 * @param callback The callback to call.
 * @param condition A function that returns true to keep the loop going, and false to stop it.
 * @returns A promise if the function is async, or void if not
 */
export function maybeAsyncWhileLoop<Returns extends Promise<void> | void>(
  callback: () => Returns,
  condition: () => boolean,
): Returns extends Promise<void> ? Promise<void> : void {
  while (condition()) {
    const result = callback();
    if (isThenable(result)) {
      // @ts-ignore
      return (async () => {
        await result;
        while (condition()) {
          await callback();
        }
      })();
    }
  }
  // @ts-ignore
  return;
}
// @TODO: move to @chickenjdk/common
export type SimpleEventListener<T, N> = (arg: T, name: N) => void;
export type EventMap = { [name: string]: SimpleEventListener<any, any> };
export type EventsStorage<M extends EventMap> = {
  [T in keyof M]:
    | {
        type: "once" | "on";
        callback: M[T];
      }[]
    | undefined;
};

export class SimpleEventEmitter<M extends EventMap = EventMap> {
  #events: EventsStorage<M> = {} as any;
  /**
   * Append a one-time listener
   * @param name Event name
   * @param callback Callback
   */
  once<T extends Extract<keyof M, string>>(name: T, callback: M[T]) {
    this.#events[name] ??= [];
    this.#events[name].push({ type: "once", callback });
  }
  /**
   * Append a listener
   * @param name Event name
   * @param callback Callback
   */
  on<T extends Extract<keyof M, string>>(name: T, callback: M[T]) {
    this.#events[name] ??= [];
    this.#events[name].push({ type: "on", callback });
  }
  /**
   * Invoke all listeners for an event sequentially
   * @param name The name of the event
   * @param arg The argument to pass to the listeners
   */
  emit<T extends Extract<keyof M, string>>(name: T, arg: Parameters<M[T]>[0]) {
    const listeners = this.#events[name];
    if (listeners !== undefined) {
      // Get array before once listeners are removed
      const listenerSnapshot = listeners.slice();

      // Purge once listeners
      for (let index = 0; index < listeners.length; index++) {
        const listener = listeners[index];
        if (listener.type === "once") {
          listeners.splice(index, 1);
          index--;
        }
      }
      // Call all listeners
      for (let index = 0; index < listenerSnapshot.length; index++) {
        const listener = listenerSnapshot[index];
        listener.callback(arg, name);
      }
    }
  }
  /**
   * Remove the first instance of a callback for an event
   * @param name The event name
   * @param callback The callback
   */
  removeListener<T extends Extract<keyof M, string>>(
    name: T,
    callback: SimpleEventListener<M[T], T>,
  ) {
    const listeners = this.#events[name];
    if (listeners !== undefined) {
      for (let index = 0; index < listeners.length; index++) {
        const listener = listeners[index];
        if (listener.callback === callback) {
          listeners.splice(index, 1);
          break;
        }
      }
    }
  }
}

export class LockQueue {
  #queue: ((aborted: boolean, abortedError: Error | undefined) => void)[] = [];
  #locked: boolean = false;
  #closed: boolean = false;
  #acquireError: Error | undefined = undefined; // The error to throw when a lock acquisition is attempted and #closed is true
  /**
   * If the queue is closed
   */
  get closed() {
    return this.#closed;
  }
  /**
   * Acquire the lock
   * @returns A promise that resolves when you have the lock, or rejects when the queue is closed
   */
  acquire() {
    if (this.#closed) {
      return Promise.reject(this.#acquireError);
    } else if (!this.#locked) {
      // Return, as the queue is already empty
      return Promise.resolve();
    } else {
      return new Promise<void>((resolve, reject) => {
        this.#queue.push((aborted, abortedError) => {
          if (aborted) {
            reject(abortedError);
          } else {
            resolve();
          }
        });
      });
    }
  }
  /**
   * Release the lock
   */
  release() {
    this.#locked = false;
    if (this.#queue.length > 0) {
      this.#queue.shift()!(false, undefined);
    }
  }
  /**
   * Throw an error on all functions waiting for the lock, and throw another whenever an acquisition is attempted
   * @param error The error to be thrown for all waiting for the lock
   * @param acquireError The error to throw whenever anyone tries to acquire the lock
   */
  close(error: Error, acquireError: Error) {
    this.#closed = true;
    this.#acquireError = acquireError;
    for (const item of this.#queue) {
      item(true, error);
    }
    // Free all listeners from queue to prevent possible leak
    this.#queue = [];
  }
}
