import {
  maybeAsyncWhileLoop,
  maybePromiseThen,
  SimpleEventEmitter,
  SimpleEventListener,
  wrapForPromise,
} from "./common.js";
import { CouldBePossiblyPromise, MaybePromise } from "./types.js";

export abstract class ChunkTransformer<IsAsync extends boolean = true | false> {
  #buffer: Uint8Array;
  #used: number = 0;
  get length() {
    return this.#used;
  }
  /**
   * Get the currently buffered data.
   * Useful for custom logic
   */
  get _buffered() {
    return this.#buffer.subarray(0, this.#used);
  }
  /**
   * The chunk size.
   * Set with .resize
   */
  get chunkSize() {
    return this.#buffer.length;
  }
  abstract handleChunk(chunk: Uint8Array): MaybePromise<void, IsAsync>;
  /**
   * A listener for a change in the length of the transformer's internal buffer
   */
  lengthChange() {}
  /**
   * Take a non-uniform-size stream of Uint8Arrays, and join them together into uniform size Uint8Arrays.
   * WARNING: Does not perform proper locking so expect issues with parallel async calls!
   * @param [chunkSize=2000] The size of a chunk. May be changed later.
   */
  constructor(chunkSize: number = 2000) {
    this.#buffer = new Uint8Array(chunkSize);
  }

  /**
   * Flush the chunk to the handler.
   * In some use cases you don't want this, like when you are just storing chunks.
   * Expose it if you want with another method if you want.
   * Used internally.
   * @private
   */
  _flush() {
    // May flush even if there is no data, but that is the caller's fault
    const chunk = this.#buffer.subarray(0, this.#used);
    this.#buffer = new Uint8Array(this.chunkSize);
    this.#used = 0;
    this.lengthChange();
    return wrapForPromise(
      this.handleChunk(chunk),
      undefined as void,
    ) as MaybePromise<void, IsAsync>;
  }
  /**
   * Flush the used section of the chunk to the handler.
   * @returns
   */
  flushUsed() {
    // If there are less than 20 bytes left, it does not really make sense to keep using the same chunk
    if (this.#buffer.length - this.#used < 20) {
      return this._flush();
    }
    const usedChunk = this.#buffer.subarray(0, this.#used);
    const restChunk = this.#buffer.subarray(this.#used);
    this.#used = 0;
    this.#buffer = restChunk;
    this.lengthChange();
    return wrapForPromise(
      this.handleChunk(usedChunk),
      undefined as void,
    ) as MaybePromise<void, IsAsync>;
  }
  /**
   * Write a Uint8Array or array
   * @param data The data to write
   */
  write(data: Uint8Array | number[]): CouldBePossiblyPromise<void, IsAsync> {
    let bytesLeft = data.length;
    let index = 0;
    return maybeAsyncWhileLoop(
      () => {
        const handler = () => {
          const bytesToWrite = Math.min(bytesLeft, this.chunkSize - this.#used);
          this.#buffer.set(
            data instanceof Array
              ? data.slice(index, index + bytesToWrite)
              : data.subarray(index, index + bytesToWrite),
            this.#used,
          );
          this.#used += bytesToWrite;
          index += bytesToWrite;
          bytesLeft -= bytesToWrite;
          this.lengthChange();
        };
        if (this.#used >= this.chunkSize) {
          return maybePromiseThen(this._flush(), handler);
        } else {
          handler();
        }
      },
      () => bytesLeft > 0,
    ) as CouldBePossiblyPromise<void, IsAsync>;
  }
  /**
   * Write a single byte
   * @param byte the byte
   */
  push(byte: number): CouldBePossiblyPromise<void, IsAsync> {
    const handler = () => {
      this.#buffer[this.#used++] = byte;
      this.lengthChange();
    };
    if (this.#used >= this.chunkSize) {
      return maybePromiseThen(this._flush(), handler) as MaybePromise<
        void,
        IsAsync
      >;
    } else {
      handler();
    }
  }
  /**
   * Change the chunk size of the buffer
   * @param chunkSize The chunk size
   */
  resize(chunkSize: number) {
    const oldData = this.#buffer.subarray(0, this.#used);
    this.#buffer = new Uint8Array(chunkSize);
    this.#used = 0;
    // Could cause issues with async
    const oldLengthChange = this.lengthChange;
    this.lengthChange = () => {};
    try {
      return maybePromiseThen(this.write(oldData), (value) => {
        this.lengthChange = oldLengthChange;
      });
    } catch (e) {
      // Prevent corruption if this errors out
      this.lengthChange = oldLengthChange;
      throw e;
    }
  }
}

export type ChunkTransformerEmitterEventMap = {
  chunk: SimpleEventListener<Uint8Array, "chunk">;
  lengthChange: SimpleEventListener<number, "lengthChange">;
  dataAvailable: SimpleEventListener<number, "dataAvailable">;
};
export class ChunkTransformerEmitter extends ChunkTransformer<false> {
  emitter: SimpleEventEmitter<ChunkTransformerEmitterEventMap>;
  handleChunk(chunk: Uint8Array): void {
    this.emitter.emit("chunk", chunk);
  }
  lengthChange(): void {
    this.emitter.emit("lengthChange", this.length);
    if (this.length > 0) {
      this.emitter.emit("dataAvailable", this.length);
    }
  }
  /**
   * Take a non-uniform-size stream of Uint8Arrays, and join them together into uniform size Uint8Arrays.
   * Emits the chunks as they are completely filled, or when .flush is called (Emits what is currently filled)
   * @param [chunkSize=2000] The size of a chunk. May be changed later.
   */
  constructor(chunkSize = 2000) {
    super(chunkSize);
    this.emitter = new SimpleEventEmitter();
  }
  /**
   * Flush the currently buffered data to the output.
   * Replaced by .flushUsed
   * @deprecated
   */
  flush() {
    return this.flushUsed();
  }
}

export class ChunkTransformerWithDataCallback<
  IsAsync extends boolean = true | false,
> extends ChunkTransformer<IsAsync> {
  #callback: (chunk: Uint8Array) => MaybePromise<void, IsAsync>;
  /**
   * Take a non-uniform-size stream of Uint8Arrays, and join them together into uniform size Uint8Arrays.
   * Calls a callback when a chunk is full or flush is called, in both cases with the data
   * @param [chunkSize=2000] The size of a chunk. May be changed later.
   */
  constructor(
    chunkSize: number = 2000,
    callback: (chunk: Uint8Array) => MaybePromise<void, IsAsync>,
  ) {
    super(chunkSize);
    this.#callback = callback;
  }
  handleChunk(chunk: Uint8Array) {
    return this.#callback(chunk);
  }
  /**
   * Flush the currently buffered data to the output.
   * Replaced by .flushUsed
   * @deprecated
   */
  flush() {
    return this.flushUsed();
  }
}
