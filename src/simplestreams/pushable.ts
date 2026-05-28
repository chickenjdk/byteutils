import { ChunkTransformerEmitter } from "../chunkBuffer.js";
import {
  LockQueue,
  maybePromiseResolve,
  noDataUint8Array,
  SimpleEventEmitter,
  SimpleEventListener,
  wrapForLockIfNeeded,
} from "../common.js";
import { StreamClosedError } from "../errors.js";
import { MaybePromise } from "../types.js";
import { writableBufferBase } from "../writableBuffer.js";
import { BaseStream, baseStreamEvents, Sourced } from "./base.js";
import FIFO from "fast-fifo";

export interface PushableStreamEvents extends baseStreamEvents {
  eof: SimpleEventListener<void, "eof">;
}

// Can not make switchable because the source is not a stream
export abstract class PushableStreamBase<IsAsync extends boolean, Source>
  extends BaseStream<IsAsync>
  implements Sourced<Source>
{
  #chunkSplitter: ChunkTransformerEmitter;
  #chunkSplitterCallback(data: Uint8Array) {
    this.#bufferedLen += data.length;
    this.#buffers.push(data);
  }
  #buffers: FIFO<Uint8Array>;
  #bufferedLen: number = 0;
  get bufferedLen() {
    return this.#bufferedLen;
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
    this._setPullableState(true);
  }
  _writeArray(data: number[]) {
    this.#closedWriteCheck();
    this.#chunkSplitter.write(data);
    this._setPullableState(true);
  }
  _writeUint8Array(data: Uint8Array) {
    this.#closedWriteCheck();
    this.#chunkSplitter.write(data);
    this._setPullableState(true);
  }
  // @ts-ignore
  #lock: IsAsync extends true ? LockQueue : undefined;
  abstract readonly source: Source;
  abstract readonly events: SimpleEventEmitter<PushableStreamEvents>;
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
    this.#buffers = new FIFO();
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
  isEof: boolean = false;
  eof() {
    this.isEof = true;
    this.events.emit("eof", undefined);
  }
  /**
   * Handle the starvation of data.
   * Called whenever we are out of data.
   * If overriding this method for any reason, make sure to call the one from this class at the start to allow its checks to work
   * @private
   * @return If null should be returned
   */
  _handleDataStarvation(): boolean {
    this._setPullableState(false);
    if (this.isEof) {
      this.close();
      return true;
    }
    return false;
  }
  #buffersShift() {
    const data = this.#buffers.shift()!;
    this.#bufferedLen -= data.length;
    return data;
  }
  _pull(ideal: number) {
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      // If we have a full chunk, output it right now
      if (this.#buffers.length > 0) {
        return maybePromiseResolve(this.#buffersShift(), this.isAsync);
      } else if (this.#chunkSplitter.length > 0) {
        // If we have enough to satisfy ideal, just flush and output that
        this.#chunkSplitter.flushUsed();
        return maybePromiseResolve(this.#buffersShift(), this.isAsync);
      } else {
        // Not enough for ideal
        // Needs more data
        if (this._handleDataStarvation()) {
          return null;
        }
        if (this.isAsync) {
          return (async () => {
            const hasEnded = await new Promise<boolean>((resolve) => {
              const closeCb = () => {
                resolve(true);
              };
              this.events.once("eof", closeCb);
              const lengthCb = (amount: number) => {
                if (this.#buffers.length > 0 || amount > 0) {
                  this.events.off("eof", closeCb);
                  this.#chunkSplitter.emitter.off("lengthChange", lengthCb);
                  resolve(false);
                }
              };
              this.#chunkSplitter.emitter.on("lengthChange", lengthCb);
            });
            if (hasEnded) {
              this.close();
              return null;
            }
            if (this.#buffers.length > 0) {
              return this.#buffersShift();
            } else {
              this.#chunkSplitter.flushUsed();
              return this.#buffersShift();
            }
          })();
        } else {
          return noDataUint8Array;
        }
      }
    }) as MaybePromise<Uint8Array, IsAsync>;
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
  readonly events: SimpleEventEmitter<PushableStreamEvents>;

  constructor(isAsync: IsAsync, chunkSize: number = 2000) {
    super(isAsync, chunkSize);
    this.source = new PushableStreamSource(this, isAsync);
    this.events = new SimpleEventEmitter();
  }
}
