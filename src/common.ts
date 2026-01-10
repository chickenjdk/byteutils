import { AwaitedUnion } from "./types";
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
  totalLength?: number
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
export function addDefaultEndianness<classType extends new (...args: any[]) => { isLe: boolean }>(
  buffer: classType,
  isLe: boolean
): classType {
  return class extends buffer {
    constructor(...args: any[]) {
      super(...args);
      this.isLe = isLe;
    }
  };
}
// Promise helpers
/**
 * Wrap a value for the completion of a promise
 * @param awaiter The value to await (may not actually be a promise, if not returns value with no wrapping)
 * @param value The value to return
 */
export function wrapForPromise<awaiter extends Promise<unknown> | unknown, value extends unknown>(
  awaiter: awaiter,
  value: value
): awaiter extends Promise<unknown> ? Promise<value> : value {
  if (awaiter instanceof Promise) {
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
  args extends unknown[]
>(
  func: func,
  params: args[],
  value: value
): ReturnType<func> extends Promise<unknown> ? Promise<value> : value {
  for (let index = 0; index < params.length; index++) {
    const output = func(...params[index]);
    if (output instanceof Promise) {
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
export function maybePromiseThen<maybePromise, returnType>(
  maybePromise: maybePromise,
  callback: (
    value: maybePromise extends Promise<unknown>
      ? Awaited<maybePromise>
      : maybePromise
  ) => returnType
): maybePromise extends Promise<unknown> ? Promise<returnType> : returnType {
  if (maybePromise instanceof Promise) {
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
  params: args[]
): ret extends Promise<unknown> ? Promise<AwaitedUnion<ret>[]> : ret[] {
  const outputs: ret[] = [];
  for (let index = 0; index < params.length; index++) {
    const output = maybeAsyncFunc(...params[index]);
    if (output instanceof Promise) {
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
