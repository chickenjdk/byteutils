import { ChunkTransformerEmitter } from "../chunkBuffer.js";
import {
  joinUint8Arrays,
  LockQueue,
  maybePromiseResolve,
  wrapForLockIfNeeded,
} from "../common.js";
import { StreamClosedError } from "../errors.js";
import { writableBufferBase } from "../writableBuffer.js";
import { BaseStream, Sourced } from "./base.js";

export abstract class PushableStreamBase<IsAsync extends boolean, Source>
  extends BaseStream<IsAsync>
  implements Sourced<Source>
{
  #chunkSplitter: ChunkTransformerEmitter;
  #chunkSplitterCallback(data: Uint8Array) {
    this.#buffers.push(data);
  }
  #buffers: Uint8Array[];
  get bufferedLen() {
    return this.#buffers.reduce((adding, { length }) => adding + length, 0);
  }
  #closedWriteCheck() {
    if (this.closed) {
      throw new StreamClosedError(
        "Tried to write to a closed pushable stream!",
      );
    }
  }
  _push(data: number) {
    this.#closedWriteCheck();
    this.#chunkSplitter.push(data);
  }
  _writeArray(data: number[]) {
    this.#closedWriteCheck();
    this.#chunkSplitter.write(data);
  }
  _writeUint8Array(data: Uint8Array) {
    this.#closedWriteCheck();
    this.#chunkSplitter.write(data);
  }
  // @ts-ignore
  #lock: IsAsync extends true ? LockQueue : undefined;
  // We do not want a pull check because the expected behavior by users is likely that a push stream will continue giving data even if it is closed until it is empty.
  _doPullCheck = false;
  abstract readonly source: Source;
  /**
   * A stream that you can push to!
   * Uses a ChunkTransformerEmitter instance as a FIFO to allow pushing data and later pulling it.
   * Unlike a normal stream from this library, when it is closed it will continue allowing reads until no more data is left.
   * @param isAsync
   * @param chunkSize
   */
  constructor(isAsync: IsAsync, chunkSize: number = 2000) {
    super();
    this.#chunkSplitter = new ChunkTransformerEmitter(chunkSize);
    this.#buffers = [];
    this.isAsync = isAsync;
    this.#chunkSplitter.emitter.on(
      "chunk",
      this.#chunkSplitterCallback.bind(this),
    );
    if (isAsync) {
      // @ts-ignore
      this.#lock = new LockQueue();
    }
  }
  isAsync: IsAsync;
  /**
   * Handle the starvation of data.
   * Called whenever we are out of data.
   * If overriding this method for any reason, make sure to call the one from this class at the start to allow its checks to work
   * @private
   */
  _handleDataStarvation(): void {
    if (this.closed) {
      this._doPullCheck = true;
      throw new StreamClosedError(
        "Stream is closed, and no data is left in the pushable source, but tried to pull from it.",
      );
    }
  }
  _pull(ideal: number) {
    // If we have a full chunk, output it right node
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      if (this.#buffers.length > 0) {
        return maybePromiseResolve(this.#buffers.shift(), this.isAsync);
      } else if (this.#chunkSplitter.length >= ideal) {
        // If we have enough to satisfy ideal, just flush and output that
        this.#chunkSplitter.flushUsed();
        return maybePromiseResolve(this.#buffers.shift(), this.isAsync);
      } else if (this.closed && this.#chunkSplitter.length > 0) {
        // If we are closed and there is ANY data, give it all and fully close
        this._doPullCheck = true;
        this.#chunkSplitter.flushUsed();
        return maybePromiseResolve(this.#buffers.shift(), this.isAsync);
      } else {
        // Not enough for ideal
        // Needs more data
        this._handleDataStarvation();
        if (this.isAsync) {
          return (async () => {
            await new Promise<void>((resolve) => {
              this.#chunkSplitter.emitter.once("lengthChange", (amount) => {
                if (amount + this.bufferedLen > ideal) {
                  resolve();
                }
              });
            });
            if (this.bufferedLen > ideal) {
              // If the currently buffered data is enough, do nothing. Otherwise, flush so we have enough.
            } else {
              this.#chunkSplitter.flushUsed();
            }
            const buffers = [];
            let length = 0;
            while (ideal > length) {
              const item = this.#buffers.shift();
              if (!item) {
                throw new Error("Huh?");
              }
              buffers.push(item);
              length += item.length;
            }
            buffers.reverse();
            return joinUint8Arrays(buffers, length);
          })();
        } else {
          return undefined;
        }
      }
    });
  }
}

export class PushableStreamSource<
  IsAsync extends boolean,
> extends writableBufferBase<IsAsync> {
  isAsync: IsAsync;
  #stream: PushableStream<IsAsync>;
  constructor(stream: PushableStream<IsAsync>, isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    this.#stream = stream;
  }
  push(value: number) {
    this.#stream._push(value);
    return maybePromiseResolve(void 0, this.isAsync);
  }
  writeArray(value: number[]) {
    this.#stream._writeArray(value);
    return maybePromiseResolve(void 0, this.isAsync);
  }
  writeArrayBackwards(value: number[]) {
    return this.writeArray(value.slice().reverse());
  }
  writeUint8Array(value: Uint8Array) {
    this.#stream._writeUint8Array(value);
    return maybePromiseResolve(void 0, this.isAsync);
  }
  writeUint8ArrayBackwards(value: Uint8Array) {
    return this.writeUint8Array(value.slice().reverse());
  }
}

export class PushableStream<IsAsync extends boolean> extends PushableStreamBase<
  IsAsync,
  PushableStreamSource<IsAsync>
> {
  readonly source: PushableStreamSource<IsAsync>;

  constructor(isAsync: IsAsync, chunkSize: number = 2000) {
    super(isAsync, chunkSize);
    this.source = new PushableStreamSource(this, isAsync);
  }
}
