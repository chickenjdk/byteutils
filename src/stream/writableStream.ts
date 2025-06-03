import { writableBufferBase } from "../";
import { Writable } from "stream";
export class writableStream extends writableBufferBase<true> {
  #stream: Writable;
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
