import { ChunkTransformerWithDataCallback } from "../chunkBuffer";
import { addDefaultEndianness } from "../common";
import { writableBufferBase } from "../writableBuffer";
import type { Writable } from "stream";
import type { WritableStream } from "stream/web";
export class writableStream<
  T extends Writable | WritableStream,
> extends writableBufferBase<true> {
  #stream: T;
  #writer: WritableStreamDefaultWriter<any> | undefined;
  /**
   * Write binary encoded data to a stream.
   * Writes each write to the stream immediately, no matter the size of the data.
   * For this reason, for high speed/bandwidth, it is recommended to use `chunkingWritableStream` to prevent memory issues with large writes and spamming the stream.
   * This is accomplished by writing data with predictably sized chunks, regardless of how small or large the writes are.
   * @param stream The stream to write to.
   */
  constructor(stream: T) {
    super();
    this.#stream = stream;
  }
  get stream(): T {
    return this.#stream;
  }
  #write(data: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      if ("write" in this.#stream) {
        this.#stream.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        if (this.#writer === undefined) {
          this.#writer = this.#stream.getWriter();
        }
        this.#writer!.write(data).then(resolve).catch(reject);
      }
    });
  }
  writeUint8Array(value: Uint8Array): Promise<void> {
    return this.#write(value);
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
    return this.writeUint8Array(Uint8Array.of(value));
  }
}
/**
 * Little-endian version of writableStream
 * @remarks You can generate this class yourself with `addDefaultEndianness(writableStream, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const writableStreamLE = addDefaultEndianness(writableStream, true);

export class chunkingWritableStream<
  T extends Writable | WritableStream,
> extends writableBufferBase<true> {
  #writer: WritableStreamDefaultWriter<any> | undefined;
  #chunkSplitter: ChunkTransformerWithDataCallback<true>;
  #stream: T;
  #used: number = 0;
  /**
   * The stream we are writing to.
   * @returns TThe stream we are writing to.
   */
  get stream(): T {
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
  #write(data: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      if ("write" in this.#stream) {
        this.#stream.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        if (this.#writer === undefined) {
          this.#writer = this.#stream.getWriter();
        }
        this.#writer!.write(data).then(resolve).catch(reject);
      }
    });
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
  constructor(stream: T, chunkSize: number = 2000) {
    super();
    this.#stream = stream;
    this.#chunkSplitter = new ChunkTransformerWithDataCallback<true>(
      chunkSize,
      this.#write,
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
