import { AwaitedUnion } from "./types";
// Buffers for converting numbers!
export const float32Array = new Float32Array(1);
export const uint8Float32ArrayView = new Uint8Array(float32Array.buffer);
export const float64Array = new Float64Array(1);
export const uint8Float64ArrayView = new Uint8Array(float64Array.buffer);
float32Array[0] = 2;
export const isBigEndian = uint8Float32ArrayView[0] === 64;
// Common helpers
/**
 * Extend the provided readable/writable buffer to set a default endianness
 * @param buffer The buffer to extend
 * @param isLe If to make the default endianness Little Endian
 */
export function addDefaultEndianness<
  T extends {
    prototype: {
      isLe: boolean;
    };
    new (...args: any[]): any; // Constructor signature
  }
>(buffer: T, isLe: boolean) {
  return class extends buffer {
    constructor(...args: any[]) {
      // @ts-ignore
      super(...args);
      this.isLe = isLe;
    }
  };
}
/**
 * Wrap a value for the completion of a promise
 * @param awaiter The value to await (may not actualy be a promise, if not returns value with no wrappping)
 * @param value The value to return
 */
export function wrapForPromise<awaiter extends unknown, value extends unknown>(
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
 * @param awaiter The value to await (may not actualy be a promise, if not returns value with no wrappping)
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

export function maybeAsyncCallArr<args extends unknown[], ret>(maybeAsyncFunc: (...args:args) => ret, params: args[]): ret extends Promise<unknown> ? Promise<AwaitedUnion<ret>[]> : ret[]{
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