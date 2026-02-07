import { ChunkTransformerWithDataCallback } from "../chunkBuffer";
import { addDefaultEndianness } from "../common";
import { writableBufferBase } from "../writableBuffer";
import { Writable } from "stream";
export class writableStream extends writableBufferBase<true> {
  #stream: Writable;
  /**
   * Write binary encoded data to a stream.
   * Writes each write to the stream immediately, no matter the size of the data.
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
/**
 * Little-endian version of writableStream
 * @remarks You can generate this class yourself with `addDefaultEndianness(writableStream, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const writableStreamLE = addDefaultEndianness(writableStream, true);

export class chunkingWritableStream extends writableBufferBase<true> {
  #chunkSplitter: ChunkTransformerWithDataCallback<true>;
  #stream: Writable;
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
    return this.#chunkSplitter._buffered.length;
  }
  /**
   * Change the chunk size of the stream.
   * This is async because it may need to flush the current buffer if the new chunk size is smaller than the current used size.
   * @param value The new chunk size to set.
   */
  async setChunkSize(value: number) {
    this.#chunkSplitter.resize(value);
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
    this.#chunkSplitter = new ChunkTransformerWithDataCallback<true>(
      chunkSize,
      (chunk) => {
        return new Promise<void>((resolve, reject) => {
          this.#stream.write(chunk, (err) => {
            if (err === null || err === undefined) {
              resolve();
            } else {
              reject(err);
            }
          });
        });
      },
    );
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
    return this.#chunkSplitter.flush();
  }
  async push(value: number) {
    this.#chunkSplitter.push(value);
  }
  async writeUint8Array(value: Uint8Array) {
    this.#chunkSplitter.write(value);
  }
  writeUint8ArrayBackwards(value: Uint8Array) {
    // Don't mutate the original value
    return this.writeUint8Array(value.slice(0).reverse());
  }
  async writeArray(value: number[]) {
    this.#chunkSplitter.write(value);
  }
  writeArrayBackwards(value: number[]) {
    return this.writeArray(value.slice(0).reverse());
  }
}
/**
 * Little-endian version of chunkingWritableStream
 * @remarks You can generate this class yourself with `addDefaultEndianness(chunkingWritableStream, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const chunkingWritableStreamLE = addDefaultEndianness(
  chunkingWritableStream,
  true,
);
