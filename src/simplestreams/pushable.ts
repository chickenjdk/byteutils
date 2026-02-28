import { ChunkTransformerEmitter } from "../chunkBuffer";
import { LockQueue, maybePromiseResolve, wrapForLockIfNeeded } from "../common";
import { MaybePromise } from "../types";
import { writableBuffer, writableBufferBase } from "../writableBuffer";
import { BaseStream } from "./base";

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
export class PushableStream<
  IsAsync extends boolean,
> extends BaseStream<IsAsync> {
  #chunkSplitter: ChunkTransformerEmitter;
  #chunkSplitterCallback(data: Uint8Array) {
    this.#buffers.push(data);
  }
  #buffers: Uint8Array[];
  _push(data: number) {
    this.#chunkSplitter.push(data);
  }
  _writeArray(data: number[]) {
    this.#chunkSplitter.write(data);
  }
  _writeUint8Array(data: Uint8Array) {
    this.#chunkSplitter.write(data);
  }
  // @ts-ignore
  #lock: IsAsync extends true ? LockQueue : undefined;

  source: PushableStreamSource<IsAsync>;
  constructor(isAsync: IsAsync, chunkSize: number = 2000) {
    super();
    this.#chunkSplitter = new ChunkTransformerEmitter(chunkSize);
    this.#buffers = [];
    this.isAsync = isAsync;
    this.#chunkSplitter.emitter.on("chunk", this.#chunkSplitterCallback.bind(this));
    if (isAsync) {
      // @ts-ignore
      this.#lock = new LockQueue();
    }
    this.source = new PushableStreamSource(this, isAsync);
  }
  isAsync: IsAsync;
  pull() {
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      if (this.#buffers.length > 0) {
        return maybePromiseResolve(this.#buffers.shift(), this.isAsync);
      } else if (this.#chunkSplitter.length > 0) {
        this.#chunkSplitter.flush();
        return maybePromiseResolve(this.#buffers.shift(), this.isAsync);
      } else {
        // Needs more data
        if (this.isAsync) {
          return (async () => {
            await new Promise<void>((resolve) => {
              this.#chunkSplitter.emitter.once("dataAvailable", () => {resolve()});
            });
            this.#chunkSplitter.flush();
            return this.#buffers.shift();
          })();
        } else {
          return new Uint8Array([]);
        }
      }
    });
  }
}
