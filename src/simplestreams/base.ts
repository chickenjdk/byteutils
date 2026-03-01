import { MaybePromise } from "../types.js";

export abstract class BaseStream<IsAsync extends boolean> {
  abstract isAsync: IsAsync;
  /**
   * Grab some data from the stream.
   * @param ideal The ideal amount of data. Implementers should ignore this if there data is chunked, and instead give the whole chunk
   */
  abstract pull(ideal: number): MaybePromise<Uint8Array, IsAsync>;
}
