import {
  maybeAsyncWhileLoop,
  maybePromiseThen,
  SimpleEventEmitter,
  SimpleEventListener,
  wrapForPromise,
} from "./common";
import { MaybePromise } from "./types";

export abstract class ChunkTransformer<IsAsync extends boolean = true | false> {
  #buffer: Uint8Array;
  #used: number = 0;
  get length() {
    return this.#used;
  }
  /**
   * Get the currently buffered data.
   * Useful for custom logic
   * @private
   */
  get _buffered() {
    return this.#buffer;
  }
  abstract handleChunk(chunk: Uint8Array): MaybePromise<void, IsAsync>;
  /**
   * Take a non-uniform-size stream of Uint8Arrays, and join them together into uniform size Uint8Arrays
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
    const chunkSize = this.#buffer.length;
    const chunk = this.#buffer.subarray(0, this.#used);
    this.#buffer = new Uint8Array(chunkSize);
    this.#used = 0;
    return wrapForPromise(this.handleChunk(chunk), undefined);
  }
  /**
   * Write a Uint8Array
   * @param data The data to write
   */
  write(data: Uint8Array) {
    let bytesLeft = data.length;
    let index = 0;
    return maybeAsyncWhileLoop(
      () => {
        const handler = () => {
          const bytesToWrite = Math.min(
            bytesLeft,
            this.#buffer.length - this.#used,
          );
          this.#buffer.set(
            data.subarray(index, index + bytesToWrite),
            this.#used,
          );
          this.#used += bytesToWrite;
          index += bytesToWrite;
          bytesLeft -= bytesToWrite;
        };
        if (this.#used >= this.#buffer.length) {
          return maybePromiseThen(this._flush(), handler);
        } else {
          handler();
        }
      },
      () => bytesLeft > 0,
    );
  }
  /**
   * Write a single byte
   * @param byte the byte
   */
  push(byte: number) {
    const handler = () => {
      this.#buffer[this.#used++] = byte;
    };
    if (this.#used >= this.#buffer.length) {
      return maybePromiseThen(this._flush(), handler);
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
    return this.write(oldData);
  }
}

export type ChunkTransformerEmitterEventMap = {
  chunk: SimpleEventListener<Uint8Array, "chunk">;
};
export class ChunkTransformerEmitter extends ChunkTransformer<false> {
  emitter: SimpleEventEmitter<ChunkTransformerEmitterEventMap>;
  handleChunk(chunk: Uint8Array): void {
    this.emitter.emit("chunk", chunk);
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
   * Flush the currently buffered data to
   */
  flush() {
    return this._flush();
  }
}
