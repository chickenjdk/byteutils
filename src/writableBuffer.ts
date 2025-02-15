import { encodeMutf8, encodeUtf8 } from "./utf8tools";
import {
  float32Array,
  float64Array,
  isBigEndian,
  uint8Float32ArrayView,
  uint8Float64ArrayView,
} from "./common";
import { uint8ArrayLike } from "./types";
function swapEndiannessWritableBuffer<
  T extends new (...args: any[]) => {
    write(value: uint8ArrayLike): void;
    writeUint8Array(value: uint8ArrayLike): void;
    writeBackwards(value: uint8ArrayLike): void;
    isLe: boolean;
  }
>(wb: T): T {
  return class extends wb {
    constructor(...args: any[]) {
      super(...args);
      this.writeBackwards = super.write.bind(this);
      this.write = super.writeBackwards.bind(this);
      this.writeUint8Array = super.writeBackwards.bind(this);
      this.isLe = !this.isLe;
    }
  };
}
const constants = {
  // 11111111111111111111111111111111 (32 bits of 1s, 4 bytes of 1s, 8 nibbles of 1s)
  allOnes: 0xffffffff,
  // 10000000000000000000000000000000
  oneThen31Zeros: 0x80000000,
  // 11111111111111111111111100000000
  allOnesButLastByte: 0xffffff00,
};
export abstract class writableBufferBase {
  // Methods to implement
  /**
   * Write data to the buffer
   * @param value The data to write
   */
  abstract write(value: uint8ArrayLike): void;
  /**
   * Write data to the buffer backwards
   */
  abstract writeBackwards(value: uint8ArrayLike): void;
  /**
   * Push a byte to the buffer
   * @param value the byte to push
   */
  abstract push(value: number): void;
  /**
   * If the buffer is little endian (THINGS BREAK IF YOU CHANGE THIS)
   */
  isLe: boolean = false;
  /**
   * Alias for .write because .write can handle Uint8Arrays. This exsists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8Array = this.write;
  /**
   * White a writeable buffer storing data to the buffer
   */
  writeWriteableBuffer(value: writableBufferStorage): void {
    this.write(Array.prototype.slice.call(value.buffer, 0));
  }
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write
   * @param bytes How many bytes the unsined int is (If not provided, it will write the minimum length)
   */
  writeUnsignedInt(value: number, bytes?: number): void {
    let mask = 0b11111111;
    let out: number[] = [];
    let i = -8;
    bytes ||= Math.ceil((32 - Math.clz32(value)) / 8);
    const bits = bytes * 8;
    while ((i += 8) < bits) {
      out.unshift((mask & value) >>> i);
      mask <<= 8;
    }
    this.write(out);
  }
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write (a bigint)
   * @param bytes How many bytes the unsined int is (If not provided, it will write the minimum length)
   */
  writeUnsignedIntBigint(value: bigint, bytes: number): void {
    let mask = 0b11111111n;
    let out: number[] = [];
    let i = -8n;
    const bits = bytes * 8;
    while ((i += 8n) < bits) {
      out.unshift(Number((mask & value) >> i));
      mask <<= 8n;
    }
    this.write(out);
  }
  /**
   * Write a twos complement to the buffer
   * @param value The number to encode
   * @param bytes How long the twos complement to be written is in bytes
   */
  writeTwosComplement(value: number, bytes?: number): void {
    const bitsLength = 32 - Math.clz32(Math.abs(value));
    bytes ||= Math.ceil((bitsLength + 1) / 8);
    this.writeUnsignedInt(
      value < 0
        ? ((constants.allOnes >>> ((4 - bytes) * 8)) & value) >>> 0
        : value,
      bytes
    );
  }
  /**
   * Write a twos complement to the buffer (From a bigint)
   * @param value The number to encode
   * @param bytes How long the twos complement to be written is in bytes
   */
  writeTwosComplementBigint(value: bigint, bytes: number) {
    this.writeUnsignedIntBigint(
      value < 0n ? ~(-1n << BigInt(bytes * 8)) & value : value,
      bytes
    );
  }
  /**
   * Write a twos complement to the buffer (one byte)
   * @param value The number to encode
   */
  writeTwosComplementByte(value: number): void {
    this.push((value & 0b11111111) >>> 0);
  }
  /**
   * Write twos complements to the buffer (one byte each)
   * @param values The numbers to encode
   */
  writeTwosComplementByteArray(values: number[]): void {
    values.forEach(this.writeTwosComplementByte.bind(this));
  }
  /**
   * Write a float to the buffer
   * @param value The float to write
   */
  writeFloat(value: number): void {
    float32Array[0] = value;
    // Typed arrays are endian-dependent, so if the computer is little-endian, the output will be in little-endian format
    if (isBigEndian) {
      this.write(uint8Float32ArrayView);
    } else {
      this.writeBackwards(uint8Float32ArrayView);
    }
  }
  /**
   * Write a double float to the buffer
   * @param value The double float to write
   */
  writeDouble(value: number): void {
    float64Array[0] = value;
    if (isBigEndian) {
      this.write(uint8Float64ArrayView);
    } else {
      this.writeBackwards(uint8Float64ArrayView);
    }
  }
  /**
   * Write a string to the buffer
   * @param value
   * @param mutf8 If true, write in javas mutf8 format instead
   * @param returnLength If true, use the cb param (TODO: JUST PLAN OLD CHECK IF THE CB PARAM EXSISTS OR JUST PLAIN RETURN THE LENGTH)
   * @param cb The callback for the length of the resulting string
   */
  writeString<returnLength extends boolean = false>(
    value: string,
    mutf8: boolean = false,
    returnLength?: returnLength,
    ...cb: returnLength extends true ? [(length: number) => void] : []
  ): void {
    if (returnLength) {
      let encoded: uint8ArrayLike;
      if (mutf8 === true) {
        encoded = encodeMutf8(value);
      } else {
        encoded = encodeUtf8(value);
      }
      (cb[0] as (length: number) => void)(encoded.length);
      this.write(encoded);
    } else {
      if (mutf8 === true) {
        this.write(encodeMutf8(value));
      } else {
        this.write(encodeUtf8(value));
      }
    }
  }
  /**
   * Encode and write a signed ones complement
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   */
  writeSignedOnesComplement(value: number, bytes?: number) {
    bytes ||= Math.ceil((33 - Math.clz32(Math.abs(value))) / 8);
    this.writeUnsignedInt(
      value < 0
        ? (value - 1) & (constants.allOnes >>> (32 - bytes * 8))
        : // Rely on the user not to use to big of a value
          value /* & (constants.allOnes >>> (32 - bytes * 8))*/,
      bytes
    );
  }
  /**
   * Encode and write a signed ones complement (from a bigint)
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   */
  writeSignedOnesComplementBigint(value: bigint, bytes: number) {
    this.writeUnsignedIntBigint(
      value < 0n
        ? (value - 1n) & ~(-1n << BigInt(32 - bytes * 8))
        : // Rely on the user not to use to big of a value
          value /* & (constants.allOnes >>> (32 - bytes * 8))*/,
      bytes
    );
  }
  /**
   * Encode and write a signed ones complement (one byte)
   * @param value The number to encode
   */
  writeSignedOnesComplementByte(value: number): void {
    this.push(value < 0 ? (value - 1) & 0xff : value);
  }
  /**
   * Encode and write a signed ones complements
   * @param values The numbers to encode
   */
  writeSignedOnesComplementByteArray(values: number[]): void {
    values.forEach(this.writeSignedOnesComplementByte.bind(this));
  }
  /**
   * Encode and write a signed integer
   * @param value The number to encode
   * @param bytes
   */
  writeSignedInteger(value: number, bytes?: number): void {
    const absValue = Math.abs(value);
    bytes ||= Math.ceil((33 - Math.clz32(absValue)) / 8);
    const bits = bytes * 8;
    this.writeUnsignedInt(
      value < 0
        ? // Rely on the user not to use to big of a value
          absValue | (1 << (bits - 1)) // & (constants.allOnes >>> (32 - bits))
        : value,
      bytes
    );
  }
  /**
   * Encode and write a signed integer (from a bigint)
   * @param value The number to encode
   * @param bytes
   */
  writeSignedIntegerBigint(value: bigint, bytes: number): void {
    // const oneLiner = (value,bytes) =>  value < 0n ? -value | (1n << (BigInt(bytes*8) - 1n)) : value;
    const bits = BigInt(bytes * 8);
    this.writeUnsignedIntBigint(
      value < 0n
        ? // Rely on the user not to use to big of a value
          -value | (1n << (bits - 1n)) // & ~(-1n << bits)
        : value,
      bytes
    );
  }
  /**
   * Encode and write a signed integer (one byte)
   * @param value The number to encode
   */
  writeSignedIntegerByte(value: number): void {
    this.push(value < 0 ? 0b10000000 | -value : value);
  }
  /**
   * Encode and write signed integers (one byte)
   * @param values The numbers to encode
   */
  writeSignedIntegerByteArray(values: number[]): void {
    values.forEach(this.writeSignedIntegerByte.bind(this));
  }
}
export declare abstract class writableBufferStorage extends writableBufferBase {
  /**
   * The data in the storage
   */
  abstract get buffer(): Uint8Array;
  /**
   * Change the contents of the buffer
   */
  abstract set buffer(newValue: uint8ArrayLike | writableBufferStorage);
  /**
   * The length of the storage
   */
  abstract get length(): number;
}
export class writableBufferResize
  extends writableBufferBase
  implements writableBufferStorage
{
  #buffer: Uint8Array;
  get buffer(): Uint8Array {
    return this.#buffer.slice(0);
  }
  /**
   * Change the buffer of exsisting data.
   * If a Uint8Array (or buffer) is pased, and it is not resizeable, it copys the bytes of the buffer
   */
  set buffer(newValue: uint8ArrayLike | writableBufferStorage) {
    if (newValue instanceof writableBufferResize) {
      this.#buffer = newValue.#buffer;
    } else {
      const buffer =
        newValue instanceof writableBufferBase ? newValue.buffer : newValue;
      // @ts-ignore
      this.#buffer.buffer.resize(buffer.length);
      for (let index = 0; index < buffer.length; index++) {
        this.#buffer[index] = buffer[index];
      }
    }
  }
  get length() {
    return this.#buffer.length;
  }
  /**
   * Create a writable buffer that operates via resizing the Uint8Array's ArrayBuffer
   * @param maxLength The max length of the buffer
   */
  constructor(maxLength?: number) {
    super();
    // A max of .5 megabytes
    // Wow typescript does not have types for es2024 yet?
    this.#buffer = new Uint8Array(
      // @ts-ignore
      new ArrayBuffer(0, { maxByteLength: maxLength ?? 500000 })
    );
  }
  #resize(bytes: number): void {
    // @ts-ignore
    this.#buffer.buffer.resize(this.#buffer.buffer.byteLength + bytes);
  }
  push(value: number): void {
    this.#resize(1);
    this.#buffer[this.#buffer.length - 1] = value;
  }
  write(value: uint8ArrayLike): void {
    this.#resize(value.length);
    const valueLengthPlueOne = value.length + 1;
    for (let i = 1; i < valueLengthPlueOne; i++) {
      this.#buffer[this.#buffer.length - i] = value[value.length - i];
    }
  }
  writeBackwards(value: uint8ArrayLike): void {
    this.#resize(value.length);
    const bufferLength = this.#buffer.length - 1;
    for (let i = 0; i < value.length; i++) {
      this.#buffer[bufferLength - i] = value[i];
    }
  }
  writeWriteableBuffer(value: writableBufferResize): void {
    this.write(Array.prototype.slice.call(value.buffer, 0));
  }
}
export const writableBufferResizeLE =
  swapEndiannessWritableBuffer(writableBufferResize);
export class writableBufferChunkArray
  extends writableBufferBase
  implements writableBufferStorage
{
  #chunkSize: number;
  #buffers: Uint8Array[];
  #used: number = 0;
  get buffer(): Uint8Array {
    return this.#buffers.reduce((joined, newBuff, index) => {
      joined.set(
        index === 0 ? newBuff.slice(0, this.#used) : newBuff,
        (this.#buffers.length - 1 - index) * this.#chunkSize
      );
      return joined;
    }, new Uint8Array(this.length));
  }
  set buffer(value: uint8ArrayLike | writableBufferStorage) {
    if (
      value instanceof writableBufferChunkArray &&
      value.#chunkSize === this.#chunkSize
    ) {
      this.#buffers = value.#buffers;
      this.#used = value.#used;
    } else {
      this.#buffers = [new Uint8Array(this.#chunkSize)];
      this.#used = 0;
      (this.isLe ? this.writeBackwards : this.write)(
        value instanceof writableBufferBase ? value.buffer : value
      );
    }
  }
  get length() {
    return (
      this.#chunkSize * this.#buffers.length - (this.#chunkSize - this.#used)
    );
  }
  constructor(chunkSize: number = 2000) {
    super();
    this.#chunkSize = chunkSize;
    this.#buffers = [new Uint8Array(chunkSize)];
  }
  push(value: number) {
    if (this.#used === this.#chunkSize) {
      this.#used = 0;
      this.#buffers.unshift(new Uint8Array(this.#chunkSize));
    }
    this.#buffers[0][this.#used++] = value;
  }
  write(value: uint8ArrayLike) {
    for (let index = 0; index < value.length; index++) {
      this.push(value[index]);
    }
  }
  writeBackwards(value: uint8ArrayLike) {
    for (let index = value.length - 1; index >= 0; index--) {
      this.push(value[index]);
    }
  }
}
export const writableBufferChunkArrayLE = swapEndiannessWritableBuffer(
  writableBufferChunkArray
);
export const writableBuffer = writableBufferChunkArray;
export const writableBufferLE = writableBufferChunkArrayLE;
