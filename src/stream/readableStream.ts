import { readableBufferBaseAsync } from "../readableBuffer";
import type { Readable } from "stream";
import { addDefaultEndianness, joinUint8Arrays } from "../common";
export class readableStream extends readableBufferBaseAsync {
  #stream: Readable;
  #chunkQueue: Uint8Array[] = [];
  #chunkIdx: number = 0;
  #locked: boolean = false;
  #lockQueue: [() => void, (reason: any) => void][] = [];
  #onDataListeners: [() => void, (reason: any) => void][] = [];
  #onDrainListeners: (() => void)[] = [];
  #onceDrainListeners: (() => void)[] = [];
  drained: boolean = true;
  destroyed: boolean = false;
  get stream(): Readable {
    return this.#stream;
  }
  get _chunks(): Uint8Array[] {
    return this.#chunkQueue;
  }
  onDrain(listener: () => void) {
    this.#onDrainListeners.push(listener);
  }
  onceDrain(listener: () => void) {
    this.#onceDrainListeners.push(listener);
  }
  constructor(stream: Readable) {
    super();
    this.#stream = stream;
    this.#stream.on("data", (chunk: Uint8Array) => {
      this.#chunkQueue.push(chunk);
      this.drained = false;
      this.#onDataListeners.forEach(([listener]) => listener());
    });
    this.#stream.on("end", () => {
      this.destroyed = true;
      const nukeReads = () => {
        // Abort all listeners because there is no more data
        [...this.#lockQueue, ...this.#onDataListeners].forEach(([, reject]) => {
          reject(new Error("Stream ended before listener could be satisfied"));
        });
        // Disable all methods that would read from the stream
        // All read calls pass through those functions, so we can just disable all reads with this
        // This is a hack, but it is the only way to make sure that all calls to #aquireLock will be rejected while keeping not checking for the stream being destroyed in those functions
        // I would just override the methods but private methods can not be overwritten
        // Empty the queue to allow the contents to gc
        this.#lockQueue = [];
        // Lock the stream so we can reject all calls to #aquireLock
        this.#locked = true;
        // Reject all calls to #aquireLock via rejecting the promise listeners passed to this array
        this.#lockQueue.push = (value) => {
          value[1](new Error("Lock not avalible, stream has ended"));
          return 1;
        };
        // Keep the stream locked so the promise listeners will be passed to above
        this.#lockQueue.shift = () => {
          this.#locked = true;
          return undefined;
        };
      };
      if (this.#onDataListeners.length > 0) {
        // If there are listeners waiting for data, well there is no data so end nuke the stream
        nukeReads();
      }
      // When a onDataListener is registered, we know there is no more data to be had, so we nuke the stream
      const oldPush = this.#onDataListeners.push;
      this.#onDataListeners.push = (...args) => {
        const res = oldPush.apply(this.#onDataListeners, args);
        nukeReads();
        return res;
      };
    });
  }
  // Help preserve order of reads. Be careful with changing login, it is kind of hacked when the stream ends
  async #aquireLock(): Promise<void> {
    if (this.#locked) {
      return new Promise((resolve, reject) => {
        this.#lockQueue.push([resolve, reject]);
      });
    }
    this.#locked = true;
  }
  async #relaseLock(): Promise<void> {
    this.#locked = false;
    const listener = this.#lockQueue.shift();
    if (listener) {
      listener[0]();
    }
    // Run drain listeners because waitChunk is not called at the end of a function
    const listeners = [...this.#onDrainListeners, ...this.#onceDrainListeners];
    if (
      listeners.length > 0 &&
      !this.drained &&
      this.#stream.readableLength === 0 &&
      (this.#chunkQueue.length === 0 ||
        this.#chunkIdx >= this.#chunkQueue[0].length)
    ) {
      this.drained = true;
      listeners.forEach((value) => value());
      this.#onceDrainListeners = [];
    }
  }
  // Handle the hard parts of waiting for data
  async #waitChunk(): Promise<void> {
    // Handle used buffer first that way the data awaiter knows that the quete realy is empty
    if (
      this.#chunkQueue.length > 0 &&
      this.#chunkIdx >= this.#chunkQueue[0].length
    ) {
      this.#chunkIdx = 0;
      this.#chunkQueue.shift();
    }
    if (this.#chunkQueue.length === 0) {
      if (!this.drained && this.#stream.readableLength === 0) {
        this.drained = true;
        const listeners = [
          ...this.#onDrainListeners,
          ...this.#onceDrainListeners,
        ];
        if (listeners.length > 0) {
          listeners.forEach((value) => value());
          this.#onceDrainListeners = [];
        }
      }
      await new Promise<void>((resolve, reject) => {
        const onData = () => {
          this.#onDataListeners.splice(
            this.#onDataListeners.findIndex(([value]) => value === onData),
            1
          );
          resolve();
        };
        this.#onDataListeners.push([onData, reject]);
      });
      this.#chunkIdx = 0;
    }
  }
  async shift(): Promise<number> {
    await this.#aquireLock();
    await this.#waitChunk();
    const chunk = this.#chunkQueue[0];
    const byte = chunk[this.#chunkIdx++];
    await this.#relaseLock();
    return byte;
  }
  async readUint8Array(bytes: number): Promise<Uint8Array> {
    await this.#aquireLock();
    const chunks: Uint8Array[] = [];
    let bytesLeft = bytes;
    while (bytesLeft !== 0) {
      await this.#waitChunk();
      const chunk = this.#chunkQueue[0];
      if (chunk.length - this.#chunkIdx > bytesLeft) {
        chunks.push(chunk.subarray(this.#chunkIdx, this.#chunkIdx + bytesLeft));
        this.#chunkIdx += bytesLeft;
        bytesLeft = 0;
      } else {
        chunks.push(chunk.subarray(this.#chunkIdx));
        bytesLeft -= chunk.length - this.#chunkIdx;
        // Consuming the whole chunk, so just delete it
        this.#chunkQueue.shift();
      }
    }
    await this.#relaseLock();
    return joinUint8Arrays(chunks, bytes);
  }
  async readUint8ArrayBackwards(bytes: number): Promise<Uint8Array> {
    return (await this.readUint8Array(bytes)).reverse();
  }
  async readArray(bytes: number): Promise<number[]> {
    const uint8Array = await this.readUint8Array(bytes);
    return Array.from(uint8Array);
  }
  async readArrayBackwards(bytes: number): Promise<number[]> {
    return (await this.readArray(bytes)).reverse();
  }
}

/**
 * Little-endian version of readableStream
 * @remarks You can generate this class yourself with `addDefaultEndianness(readableStream, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const readableStreamLE = addDefaultEndianness(readableStream, true);
