import {
  maybePromiseResolve,
  SimpleEventEmitter,
  SimpleEventListener,
} from "../common.js";
import { MaybePromise } from "../types.js";

export interface baseStreamEvents {
  pullableStateChange: SimpleEventListener<boolean, "pullableStateChange">;
  close: SimpleEventListener<void, "close">;
}

export abstract class BaseStream<IsAsync extends boolean> {
  abstract readonly events: SimpleEventEmitter<baseStreamEvents>;
  get closed() {
    return this.#closed;
  }
  #closed: boolean = false;
  close() {
    this.#closed = true;
    // A stream can't be pulled if it is closed
    this._setPullableState(false);
    this.events.emit("close", undefined);
  }
  abstract isAsync: IsAsync;
  /**
   * If the pull check of "is the stream closed" should be performed. Can be changed.
   * @private
   */
  _doPullCheck: boolean = true;
  /**
   * If the stream can currently be pulled. Edit with setPullableState
   */
  #pullable: boolean = true;
  get pullable() {
    return this.#pullable;
  }
  /**
   * Change the pullable state. For implementers only.
   * @private
   * @param state The pullable state.
   */
  _setPullableState(state: boolean) {
    // Do nothing if we are closed, as this may be called by reads that were going on before the stream was closed as they finish.
    if (this.#closed) {
      return;
    }
    if (this.#pullable !== state) {
      this.#pullable = state;
      this.events.emit("pullableStateChange", state);
    }
  }
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
   * Should return null if the stream is closed
   * @param ideal The ideal amount of data. Implementers should ignore this if there data is chunked, and instead give the whole chunk. If they do not yet have a full chunk, give what you have.
   * @returns Uint8Array containing the data, but if the stream is sync and no data is present, it should throw a CanNotWaitDueToSyncError
   */
  pull(ideal: number): MaybePromise<Uint8Array | null, IsAsync> {
    if (this.#closed && this._doPullCheck) {
      return maybePromiseResolve(null, this.isAsync);
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
