import { writableBufferBase } from "../writableBuffer.js";
import { BaseStream, baseStreamEvents } from "./base.js";
import { LockQueue, SimpleEventEmitter } from "../common.js";

// TODO: clean up

export class WriterSourceInput extends writableBufferBase<true> {
  readonly #dataLock: LockQueue;
  readonly #dataOutputLock: LockQueue;
  #dataCb: [(data: Uint8Array) => void, (error: Error) => void] | undefined;
  #getDataCb: [() => void, (error: Error) => void] | undefined;
  async getData() {
    await this.#dataLock.acquire();
    try {
      const data = new Promise<Uint8Array>((resolve, reject) => {
        this.#dataCb = [resolve, reject];
      });
      if (this.#getDataCb) {
        this.#getDataCb[0]();
      }
      await data;
      return data;
    } finally {
      this.#dataLock.release();
      this.#dataCb = undefined;
    }
  }
  close(error: Error) {
    this.#dataLock.close(error, error);
    this.#dataCb && this.#dataCb[1](error);
    this.#getDataCb && this.#getDataCb[1](error);
  }
  constructor() {
    super();
    this.#dataLock = new LockQueue();
    this.#dataOutputLock = new LockQueue();
  }
  writeArray(value: number[]): Promise<void> {
    return this.writeUint8Array(new Uint8Array(value));
  }
  writeArrayBackwards(value: number[]): Promise<void> {
    return this.writeUint8Array(new Uint8Array(value).reverse());
  }
  async writeUint8Array(value: Uint8Array): Promise<void> {
    await this.#dataOutputLock.acquire();
    if (this.#dataCb) {
      this.#dataCb[0](value);
    } else {
      await new Promise<void>((resolve, reject) => {
        this.#getDataCb = [resolve, reject];
      });
      this.#getDataCb = undefined;
      this.#dataCb![0](value);
    }
    this.#dataOutputLock.release();
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
