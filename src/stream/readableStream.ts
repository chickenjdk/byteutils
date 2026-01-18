import { readableBufferBaseAsync } from "../readableBuffer";
import type { Readable } from "stream";
import {
  addDefaultEndianness,
  joinUint8Arrays,
  LockQueue,
  SimpleEventEmitter,
  SimpleEventListener,
} from "../common";
import { StreamEndedError } from "./errors";
type readableStreamEventMap = {
  data: SimpleEventListener<undefined, "data">;
  drain: SimpleEventListener<undefined, "data">;
  close: SimpleEventListener<undefined, "close">;
};
export class readableStream extends readableBufferBaseAsync {
  #stream: Readable;
  #chunkQueue: Uint8Array[] = [];
  #chunkIdx: number = 0;
  #lock: LockQueue;
  drained: boolean = true;
  destroyed: boolean = false;
  get stream(): Readable {
    return this.#stream;
  }
  get _chunks(): Uint8Array[] {
    return this.#chunkQueue;
  }
  events: SimpleEventEmitter<readableStreamEventMap>;
  /**
   * Add a on drain listener to the stream
   * @deprecated Use (readable stream instance).events.on("drain", listener) instead
   * @param listener The listener to add
   */
  onDrain(listener: () => void) {
    // Wrap to prevent extra args being passed
    this.events.on("drain", () => listener());
  }
  /**
   * Add a once drain listener to the stream
   * @deprecated Use (readable stream instance).events.once("drain", listener) instead
   * @param listener The listener to add
   */
  onceDrain(listener: () => void) {
    this.events.once("drain", () => listener());
  }
  constructor(stream: Readable) {
    super();
    this.events = new SimpleEventEmitter<readableStreamEventMap>();
    this.#lock = new LockQueue();

    this.#stream = stream;
    // This listener has to go first by the way
    this.#stream.on("data", (chunk: Uint8Array) => {
      this.#chunkQueue.push(chunk);
      this.drained = false;
      this.events.emit("data", undefined);
    });
    this.#stream.on("close", () => {
      this.destroyed = true;
      // Abort all listeners because there is no more data
      this.events.emit("close", undefined);
    });
  }
  // Handle the hard parts of waiting for data
  async #waitChunk(): Promise<void> {
    // Handle used buffer first that way the data awaiter knows that the queue really is empty
    if (
      this.#chunkQueue.length > 0 &&
      this.#chunkIdx >= this.#chunkQueue[0].length
    ) {
      // If the chunk has been consumed, remove it
      this.#chunkIdx = 0;
      this.#chunkQueue.shift();
    }
    const makeEndError = () =>
      new StreamEndedError("Stream ended before data was received");

    if (this.#chunkQueue.length === 0) {
      if (this.destroyed) {
        throw makeEndError();
      } else {
        // No chunks currently
        return new Promise((resolve, reject) => {
          this.events.once("data", resolve);
          this.events.once("close", () => reject(makeEndError()));
        });
      }
    }
  }
  async shift(): Promise<number> {
    await this.#lock.acquire();
    await this.#waitChunk();
    const chunk = this.#chunkQueue[0];
    const byte = chunk[this.#chunkIdx++];
    this.#lock.release();
    return byte;
  }
  async readUint8Array(bytes: number): Promise<Uint8Array> {
    await this.#lock.acquire();
    const chunks: Uint8Array[] = [];
    let bytesLeft = bytes;
    while (bytesLeft !== 0) {
      await this.#waitChunk();
      const chunk = this.#chunkQueue[0];
      if (chunk.length - this.#chunkIdx > bytesLeft) {
        // If we are not going to use the whole chunk, meaning we also will be finishing
        chunks.push(chunk.subarray(this.#chunkIdx, this.#chunkIdx + bytesLeft));
        this.#chunkIdx += bytesLeft;
        bytesLeft = 0;
      } else {
        // We are using the whole chunk
        chunks.push(chunk.subarray(this.#chunkIdx));
        bytesLeft -= chunk.length - this.#chunkIdx;
        // Consuming the whole chunk, so just delete it
        this.#chunkQueue.shift();
      }
    }
    this.#lock.release();
    return joinUint8Arrays(chunks, bytes);
  }
  async readUint8ArrayBackwards(bytes: number): Promise<Uint8Array> {
    return (await this.readUint8Array(bytes)).reverse(); // Safe to mutate because no one else will use them
  }
  async readArray(bytes: number): Promise<number[]> {
    const uint8Array = await this.readUint8Array(bytes);
    return Array.from(uint8Array);
  }
  async readArrayBackwards(bytes: number): Promise<number[]> {
    return (await this.readArray(bytes)).reverse(); // Safe to mutate because no one else will use them
  }
}

/**
 * Little-endian version of readableStream
 * @remarks You can generate this class yourself with `addDefaultEndianness(readableStream, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const readableStreamLE = addDefaultEndianness(readableStream, true);
