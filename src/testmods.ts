import {
  knownAsyncCallArr,
  knownPromiseThen,
  wrapForKnownAsyncCallArr,
  wrapForPromiseKnown,
} from "./common.js";

export function testWrap(from: () => 10 | Promise<10>, async: boolean) {
  return wrapForPromiseKnown(from(), 18, async);
}

export function testKPT(from: () => 10 | Promise<10>, async: boolean) {
  return knownPromiseThen(from(), (value) => value * 2, async);
}

export function testKACA(
  from: (v: string) => `Hello ${typeof v}` | Promise<`Hello ${typeof v}`>,
  names: string[],
  async: boolean,
) {
  knownAsyncCallArr(
    from,
    names.map((v) => [v]),
    async,
  );
}

export function testWrapForKACA(
  from: (v: string) => void,
  names: string[],
  output: number,
  async: boolean,
) {
  wrapForKnownAsyncCallArr(
    from,
    names.map((v) => [v]),
    output,
    async,
  );
}
