import { addDefaultEndianness, writableBufferBase } from "../";
import { Writable } from "stream";
export class writableStream extends writableBufferBase<true> {
  #stream: Writable;
  /**
   * Write binary encoded data to a stream.
   * Writes each write to the stream immeditly, no matter the size of the data.
   * For this reason, for high speed/bandwidth, it is recommended to use `chunkingWritableStream` to prevent memory issues with large writes and spamming the stream.
   * This is accomplished by writing data with predictably sized chunks, regardless of how small or large the writes are.
   * @param stream The stream to write to.
   */
  constructor(stream: Writable) {
    super();
    this.#stream = stream;
  }
  get stream(): Writable {
    return this.#stream;
  }
  writeUint8Array(value: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#stream.write(value, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  writeUint8ArrayBackwards(value: Uint8Array): Promise<void> {
    return this.writeUint8Array(value.slice(0).reverse());
  }
  writeArray(value: number[]): Promise<void> {
    return this.writeUint8Array(Uint8Array.from(value));
  }
  writeArrayBackwards(value: number[]): Promise<void> {
    // writeUint8ArrayBackwards clones the input to prevent its mutation but we already clone it via Uint8Array.from so we can just reverse it directly
    return this.writeUint8Array(Uint8Array.from(value).reverse());
  }
  push(value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#stream.write(Uint8Array.of(value), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
export const writableStreamLE = addDefaultEndianness(writableStream, true);

export class chunkingWritableStream extends writableBufferBase<true> {
  #chunkSize: number;
  #stream: Writable;
  // Always get the buffer's length to allow safely changing chunkSIze
  #buffer: Uint8Array;
  #used: number = 0;
  /**
   * The stream we are writing to.
   * @returns TThe stream we are writing to.
   */
  get stream(): Writable {
    return this.#stream;
  }
  /**
   * The size of the chunks to write to the stream.
   * If you need to change it, please use the `setChunkSize` method.
   * @returns The size of the chunks to write to the stream.
   * @default 2000
   */
  get chunkSize(): number {
    return this.#chunkSize;
  }
  /**
   * Change the chunk size of the stream.
   * This is async because it may need to flush the current buffer if the new chunk size is smaller than the current used size.
   * @param value The new chunk size to set.
   */
  async setChunkSize(value: number) {
    this.#chunkSize = value;
    if (this.#used < value) {
      // If the new chunk size is larger, we can just copy the old buffer to the new one
      const oldBuffer = this.#buffer;

      this.#buffer = new Uint8Array(value);
      this.#buffer.set(oldBuffer.subarray(0, this.#used), 0);
    } else if (this.#used > value) {
      // Not enough space in the buffer, so we need to flush it
      // This will do one last write in the old chunk size, but who cares?
      await this.flush();
      this.#buffer = new Uint8Array(this.#chunkSize);
    }
  }
  /**
   * Write to the stream in predictable sized chunks.
   * This is useful for high speed/bandwidth writes to a stream, as it prevents memory issues with large writes and spamming the stream.
   * It accomplishes this by writing data with predictably sized chunks, regardless of how small or large the writes are.
   * If you need the data written immediately, you can use the `flush` method to write the current buffer to the stream.
   * If you need each write to be written immediately, use `writableStream` instead.
   * @param stream The stream to write to.
   * @param chunkSize The size of the chunks to write to the stream.
   */
  constructor(stream: Writable, chunkSize: number = 2000) {
    super();
    this.#stream = stream;
    this.#chunkSize = chunkSize;
    this.#buffer = new Uint8Array(chunkSize);
  }
  /**
   * Flush the buffer to the stream. Not public because users should not be trusting the buffer to be full.
   * This is used internally to ensure that the buffer is flushed when it is full.
   * It writes the entire buffer to the stream and resets the buffer.
   * @private
   * @returns A promise that resolves when the buffer is flushed.
   */
  #flushFull(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#stream.write(this.#buffer, (err) => {
        this.#used = 0;
        this.#buffer.fill(0);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  /**
   * Flush the buffer to the stream.
   * If the buffer is empty, it resolves immediately.
   * If the buffer is not empty, it writes the used section of the buffer to the stream and resets the buffer.
   * This is useful for ensuring that all data is sent to the stream before closing it or performing other operations.
   * @returns A promise that resolves when the buffer is flushed.
   */
  flush(): Promise<void> {
    if (this.#used === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.#stream.write(this.#buffer.subarray(0, this.#used), (err) => {
        this.#used = 0;
        this.#buffer.fill(0); // Reset the buffer to zeroes
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  async push(value: number) {
    if (this.#used === this.#buffer.length) {
      await this.#flushFull();
    }
    this.#buffer[this.#used++] = value;
  }
  async writeUint8Array(value: Uint8Array) {
    let bytesLeft = value.length;
    let index = 0;
    while (bytesLeft > 0) {
      if (this.#used === this.#buffer.length) {
        await this.#flushFull();
      }
      const bytesToWrite = Math.min(
        bytesLeft,
        this.#buffer.length - this.#used
      );
      this.#buffer.set(value.subarray(index, index + bytesToWrite), this.#used);
      this.#used += bytesToWrite;
      index += bytesToWrite;
      bytesLeft -= bytesToWrite;
    }
  }
  writeUint8ArrayBackwards(value: Uint8Array) {
    // Don't mutate the origional value
    return this.writeUint8Array(value.slice(0).reverse());
  }
  async writeArray(value: number[]) {
    let bytesLeft = value.length;
    let index = 0;
    while (bytesLeft > 0) {
      if (this.#used === this.#buffer.length) {
        await this.#flushFull();
      }
      const bytesToWrite = Math.min(
        bytesLeft,
        this.#buffer.length - this.#used
      );
      this.#buffer.set(value.slice(index, index + bytesToWrite), this.#used);
      this.#used += bytesToWrite;
      index += bytesToWrite;
      bytesLeft -= bytesToWrite;
    }
  }
  writeArrayBackwards(value: number[]) {
    return this.writeArray(value.slice(0).reverse());
  }
}
export const chunkingWritableStreamLE = addDefaultEndianness(
  chunkingWritableStream,
  true
);
