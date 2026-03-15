import { StreamClosedError } from "../errors.js";

export abstract class BaseStream<IsAsync extends boolean> {
  get closed() {
    return this.#closed;
  }
  #closed: boolean = false;
  close() {
    this.#closed = true;
  }
  abstract isAsync: IsAsync;
  /**
   * If the pull check of "is the stream closed" should be performed. Can be changed.
   * @private
   */
  _doPullCheck: boolean = true;
  /**
   * The internal pull handler.
   * Same thing, except it does not perform the closed check.
   * For implementers only.
   * IMPLEMENTERS: See the argument descriptions on .pull. If you do not want a closed check, set _doPullCheck to false.
   * @private
   */
  abstract _pull(
    ...args: Parameters<BaseStream<IsAsync>["pull"]>
  ): ReturnType<BaseStream<IsAsync>["pull"]>;
  /**
   * Grab some data from the stream.
   * @param ideal The ideal amount of data. Implementers should ignore this if there data is chunked, and instead give the whole chunk.
   * @returns Uint8Array containing the data, but if there will be more data, there just is not yet, AND the stream is sync, it will give undefined.
   */
  pull(
    ideal: number,
  ): IsAsync extends false ? Uint8Array | undefined : Promise<Uint8Array> {
    if (this.#closed && this._doPullCheck) {
      throw new StreamClosedError("Stream is closed but tried to pull from it");
    }
    // @ts-ignore
    return this._pull(...arguments);
  }
}

export abstract class Sourced<T> {
  /**
   * The source of this class.
   * IMPLEMENTERS: make it readonly
   */
  abstract readonly source: T;
}
