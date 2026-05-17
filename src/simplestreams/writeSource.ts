import FastFIFO from "fast-fifo";
import { writableBufferBase } from "../writableBuffer.js";
import { BaseStream, baseStreamEvents } from "./base.js";
import {
  LockQueue,
  SimpleEventEmitter,
} from "../common.js";

export class WriterSourceInput extends writableBufferBase<true> {
  readonly #dataLock: LockQueue;
  #dataCb: [() => void, (error: Error) => void] = [() => void 0, () => void 0];
  #data: FastFIFO<Uint8Array>;

  async getData() {
    await this.#dataLock.acquire();
    if (this.#data.isEmpty()) {
      await new Promise<void>(
        (resolve, reject) => (this.#dataCb = [resolve, reject]),
      );
    }
    const data = this.#data.shift()!;
    this.#dataLock.release();
    return data;
  }
  close(error: Error) {
    this.#dataLock.close(error, error);
    this.#dataCb[1](error);
  }
  constructor() {
    super();
    this.#dataLock = new LockQueue();
    this.#data = new FastFIFO();
  }
  writeArray(value: number[]): Promise<void> {
    return this.writeUint8Array(new Uint8Array(value));
  }
  writeArrayBackwards(value: number[]): Promise<void> {
    return this.writeUint8Array(new Uint8Array(value).reverse());
  }
  async writeUint8Array(value: Uint8Array): Promise<void> {
    this.#data.push(value);
    this.#dataCb[0]();
  }
  writeUint8ArrayBackwards(value: Uint8Array): Promise<void> {
    return this.writeUint8Array(value.slice().reverse());
  }
  // This implementation is slow, but I don't see another way
  push(value: number): Promise<void> {
    return this.writeUint8Array(new Uint8Array([value]));
  }
}
export class WriterSource extends BaseStream<true> {
  readonly isAsync: true = true;
  readonly source: WriterSourceInput;
  readonly events: SimpleEventEmitter<baseStreamEvents>;
  constructor() {
    super();
    this.source = new WriterSourceInput();
    this.events = new SimpleEventEmitter();
    this.events.once("close", () => {
      this.source.close(new Error("Stream is closed"));
    });
  }
  _pull(ideal: number): Promise<Uint8Array<ArrayBufferLike>> {
    return this.source.getData();
  }
}
