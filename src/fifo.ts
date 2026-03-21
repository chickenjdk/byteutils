import { ChunkTransformerWithDataCallback } from "./chunkBuffer.js";
import FIFO from "fast-fifo";
import { joinUint8Arrays } from "./common.js";
import { ChunkReader } from "./chunkReader.js";

export class BytesFIFOChunkBuffer extends ChunkTransformerWithDataCallback<false> {
  readonly resizingIsImmediate = false;
  #alloc: () => Uint8Array | undefined;
  constructor(
    chunkSize: number,
    callback: (chunk: Uint8Array) => void,
    alloc: () => Uint8Array | undefined,
  ) {
    super(chunkSize, callback);
    this.#alloc = alloc;
  }
  _allocate(): Uint8Array {
    let allocated = undefined;
    try {
      allocated = this.#alloc();
    } catch (e) {
      if (!(e instanceof TypeError)) {
        throw e;
      }
    }
    if (allocated === undefined) {
      return new Uint8Array(this.chunkSize);
    } else {
      return allocated;
    }
  }
}
// startIndex: inclusive, endIndex: exclusive
export class BytesFIFO extends ChunkReader<false> {
  #spareBuffers: Set<Uint8Array>;
  #buffersFifo: FIFO<Uint8Array>;
  #chunkBuffer: BytesFIFOChunkBuffer;
  get chunkBufferLength() {
    return this.#chunkBuffer.length;
  }
  get hasChunks() {
    return !this.#buffersFifo.isEmpty();
  }
  #alloc() {
    if (this.#spareBuffers.size > 0) {
      const value = this.#spareBuffers.values().next().value!;
      this.#spareBuffers.delete(value);
      return value;
    }
  }
  constructor(chunkSize: number = 2000) {
    super(false);
    this.#spareBuffers = new Set();
    this.#buffersFifo = new FIFO();
    this.#chunkBuffer = new BytesFIFOChunkBuffer(
      chunkSize,
      (data) => {
        this.#buffersFifo.push(data);
      },
      this.#alloc.bind(this),
    );
  }
  write(...args: Parameters<BytesFIFOChunkBuffer["write"]>) {
    this.#chunkBuffer.write(...args);
  }
  push(...args: Parameters<BytesFIFOChunkBuffer["push"]>) {
    this.#chunkBuffer.push(...args);
  }

  getChunk() {
    if (this.#buffersFifo.isEmpty()) {
      if (this.#chunkBuffer.length > 0) {
        this.#chunkBuffer.flushUsed();
      } else {
        throw new Error(
          "Tried to get a chunk, but no data is contained in the FIFO!",
        );
      }
    }
    const data = this.#buffersFifo.shift();
    if (data === undefined) {
      throw new Error("This should not happen, but it did :(");
    }
    return data;
  }
  /**
   * Change the internal chunk size for newly allocated chunks of this FIFO
   * @param size
   */
  resize(size: number) {
    this.#chunkBuffer.resize(size);
  }
  /**
   * Drop any spare chunks not in use down to leaving only toBytes total bytes allocated in them left
   * @param toBytes
   */
  drop(toBytes: number) {
    const buffers = Array.from(this.#spareBuffers);
    let endIndex = undefined;
    let dataLength = 0;
    for (let index = 0; index < buffers.length; index++) {
      const item = buffers[index];
      dataLength += item.length;
      if (dataLength > toBytes) {
        // .slice is exclusive with the end index so we don't need a -1 here
        endIndex = index;
        break;
      }
    }
    if (endIndex !== undefined) {
      // Prevent -1 (or lower) causing us to include buffers we should not by making sure endIndex is not less than 0
      this.#spareBuffers = new Set(buffers.slice(0, Math.max(0, endIndex)));
    }
  }
}
