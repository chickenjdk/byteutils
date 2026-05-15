import {
  joinUint8Arrays,
  knownAsyncWhileLoop,
  knownPromiseThen,
  LockQueue,
  maybePromiseResolve,
  noDataUint8Array,
  wrapForLockIfNeeded,
} from "./common.js";
import { readableBufferBase } from "./readableBuffer.js";
import { MaybePromise } from "./types.js";

export abstract class ChunkReader<
  IsAsync extends boolean,
> extends readableBufferBase {
  get chunkDataLeft() {
    // This is correct because the chunk index should be the index that the next byte should be read from
    return Math.max((this.#chunk?.length ?? 0) - this.#chunkIndex, 0);
  }

  /**
   * Consume and output a chunk, if one is present.
   * If one is not present, and the guarantee option is true, it will consume a chunk from the source and output that.
   * @param guarantee If this method should get a chunk from the source if one is not present. False by default.
   * @param idealChunkSize The ideal chunk size, N/A if guarantee is false.
   * @returns The chunk. Will be an empty Uint8Array if no chunk is present.
   */
  consumeChunk(guarantee = false, idealChunkSize = 2000): MaybePromise<Uint8Array, IsAsync> {
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      const done = () => {
        const startIndex = this.#chunkIndex;
        this.#chunkIndex = this.#chunk!.length;
        return maybePromiseResolve(
          this.#chunk!.subarray(startIndex),
          this.isAsync,
        );
      };
      if (guarantee) {
        return knownPromiseThen(
          this.#guaranteeChunk(idealChunkSize),
          done,
          this.isAsync,
        );
      } else {
        if (this.#chunk) {
          return done();
        } else {
          return maybePromiseResolve(noDataUint8Array, this.isAsync);
        }
      }
    }) as MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
  }

  #chunk: Uint8Array | undefined;
  #chunkIndex: number = 0;
  isAsync: IsAsync;
  // @ts-ignore
  #lock: IsAsync extends true ? LockQueue : undefined;

  constructor(isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    if (isAsync) {
      // @ts-ignore
      this.#lock = new LockQueue();
    }
  }

  abstract getChunk(idealLength: number): MaybePromise<Uint8Array, IsAsync>;

  #guaranteeChunk(idealLength: number) {
    if (this.chunkDataLeft > 0) {
      return maybePromiseResolve(void 0, this.isAsync);
    }
    return knownPromiseThen(
      this.getChunk(idealLength),
      (value) => {
        this.#chunk = value;
        this.#chunkIndex = 0;
      },
      this.isAsync,
    );
  }

  readUint8Array(bytes: number) {
    let left = bytes;
    let index = 0;
    let chunks: Uint8Array[] = [];
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () =>
      knownPromiseThen(
        knownAsyncWhileLoop(
          () => {
            return knownPromiseThen(
              this.#guaranteeChunk(left),
              () => {
                if (this.chunkDataLeft >= left) {
                  // This is safe because guaranteeChunk should have made the chunk available and no one else should have touched it due to the lock
                  const data = this.#chunk!.slice(
                    this.#chunkIndex,
                    (this.#chunkIndex += left),
                  );
                  left = 0;
                  index += left;
                  chunks.push(data);
                } else {
                  const data = this.#chunk!.slice(this.#chunkIndex);
                  this.#chunkIndex += data.length;
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

  shift() {
    return knownPromiseThen(
      wrapForLockIfNeeded(this.isAsync, this.#lock, () =>
        this.#guaranteeChunk(1),
      ),
      () => {
        return this.#chunk![this.#chunkIndex++];
      },
      this.isAsync,
    );
  }
}
