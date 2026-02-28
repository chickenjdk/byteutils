import {
  joinUint8Arrays,
  knownAsyncWhileLoop,
  knownPromiseThen,
  LockQueue,
  maybePromiseResolve,
  wrapForLockIfNeeded,
} from "../common";
import { readableBufferBase } from "../readableBuffer";
import { MaybePromise } from "../types";
import { BaseStream } from "./base";

export class StreamHandle<
  IsAsync extends boolean,
> extends readableBufferBase<IsAsync> {
  #source: BaseStream<IsAsync>;

  #chunk: Uint8Array = new Uint8Array([]);
  #chunkIdx: number = 0;
  // Lock is only needed if we are async because if not all calls block
  //@ts-ignore
  #lock: IsAsync extends true ? LockQueue : undefined;

  isAsync: IsAsync;
  get #chunkDataLeft() {
    return this.#chunk.length - this.#chunkIdx;
  }
  constructor(source: BaseStream<IsAsync>, isAsync: IsAsync) {
    super();
    this.#source = source;
    if (isAsync) {
      //@ts-ignore
      this.#lock = new LockQueue();
    }
    this.isAsync = isAsync;
  }
  #guaranteeActiveChunk(ideal: number): MaybePromise<void, IsAsync> {
    // Meaning our index is out of range
    if (!(this.#chunkIdx in this.#chunk)) {
      // @ts-ignore
      return knownPromiseThen(
        this.#source.pull(ideal),
        (value) => {
          if (value.length > 0) {
            this.#chunk = value;
            this.#chunkIdx = 0;
          } else {
            return this.#guaranteeActiveChunk(ideal);
          }
        },
        this.isAsync,
      );
    } else {
      return maybePromiseResolve(void 0, this.isAsync);
    }
  }

  shift() {
    return knownPromiseThen(
      wrapForLockIfNeeded(this.isAsync, this.#lock, () =>
        this.#guaranteeActiveChunk(1),
      ),
      () => {
        return this.#chunk[this.#chunkIdx++];
      },
      this.isAsync,
    );
  }
  readUint8Array(bytes: number): MaybePromise<Uint8Array, IsAsync> {
    let left = bytes;
    let index = 0;
    let chunks: Uint8Array[] = [];
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () =>
      knownPromiseThen(
        knownAsyncWhileLoop(
          () => {
            return knownPromiseThen(
              this.#guaranteeActiveChunk(left),
              () => {
                if (this.#chunkDataLeft >= left) {
                  const data = this.#chunk.slice(
                    this.#chunkIdx,
                    (this.#chunkIdx += left),
                  );
                  left = 0;
                  index += left;
                  chunks.push(data);
                } else {
                  const data = this.#chunk.slice(this.#chunkIdx);
                  this.#chunkIdx += data.length;
                  left -= data.length;
                  index += data.length;
                  chunks.push(data);
                }
              },
              this.isAsync,
            );
          },
          () => !(left <= 0),
          this.isAsync,
        ),
        () => joinUint8Arrays(chunks, bytes),
        this.isAsync,
      ),
    );
  }
  readUint8ArrayBackwards(bytes: number) {
    // readUint8Array handles the lock
    return knownPromiseThen(
      this.readUint8Array(bytes),
      (value) => {
        return value.reverse();
      },
      this.isAsync,
    );
  }
  readArray(bytes: number) {
    return knownPromiseThen(
      this.readUint8Array(bytes),
      (value) => {
        return Array.from(value);
      },
      this.isAsync,
    );
  }
  readArrayBackwards(bytes: number) {
    return knownPromiseThen(
      this.readUint8ArrayBackwards(bytes),
      (value) => {
        return Array.from(value);
      },
      this.isAsync,
    );
  }
}
