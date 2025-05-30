import { decodeMutf8, decodeUtf8 } from "./utf8tools";
import {
  float32Array,
  uint8Float32ArrayView,
  float64Array,
  uint8Float64ArrayView,
  isBigEndian,
  addDefaultEndianness,
  maybePromiseThen,
  maybeAsyncCallArr,
} from "./common";
import type { asyncify, cloneFunc } from "./types";
const constants = {
  // 11111111111111111111111111111111
  allOnes: 0xffffffff,
  // 10000000000000000000000000000000
  oneThen31Zeros: 0x80000000,
  // 11111111111111111111111100000000
  allOnesButLastByte: 0xffffff00,
};
export abstract class readableBufferBase {
  // Methods to implement
  /**
   * Read from the start of the buffer
   */
  abstract shift(): number | Promise<number>;
  /**
   * Read a Uint8Array from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract readUint8Array(bytes: number): Uint8Array | Promise<Uint8Array>;
  /**
   * Read a ReadableBuffer from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract readReadableBuffer(
    bytes: number
  ): readableBuffer | Promise<readableBuffer>;
  /**
   * Read a number array (0-255) from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract read(bytes: number): number[] | Promise<number[]>;
  /**
   * Read a number array (0-255) from the start of the buffer backwards
   * @param bytes How many bytes to read
   */
  abstract readBackwards(bytes: number): number[] | Promise<number[]>;
  // "real" code
  // Little-endian support: <-
  /**
   * Read a Uint8Array from the start of the buffer (endian-dependent)
   */
  readUint8ArrayEndian = this.readUint8Array;
  /**
   * Read a number array (0-255) from the start of the buffer (endian-dependent)
   * @param value The data to write
   */
  readEndian: cloneFunc<typeof this.read | typeof this.readBackwards> =
    this.read;
  /**
   * Read a number array (0-255) from the start of the buffer backwards (endian-dependent)
   */
  readBackwardsEndian: cloneFunc<typeof this.read | typeof this.readBackwards> =
    this.readBackwards;
  #isLe = false;
  /**
   * If the buffer is little endian
   */
  get isLe(): boolean {
    return this.#isLe;
  }
  /**
   * If the buffer is little endian
   */
  set isLe(isLe: boolean) {
    if (isLe) {
      this.readEndian = this.readBackwards;
      this.readBackwardsEndian = this.read;
      this.readUint8ArrayEndian = (...args) =>
        maybePromiseThen(this.readUint8Array(...args), (read) =>
          read.reverse()
        );
    } else {
      this.readEndian = this.read;
      this.readBackwardsEndian = this.readBackwards;
      this.readUint8ArrayEndian = this.readUint8Array;
    }
    this.#isLe = isLe;
  }
  // ->
  /**
   * Read a unsigned integer
   * @param bytes How many bytes the data is
   * @returns The parsed unsigned integer
   */
  readUnsignedInt(bytes: number) {
    return maybePromiseThen(
      this.readEndian(bytes),
      (read) =>
        read.reverse().reduce(function (creating, byte, index): number {
          return creating | (byte << (index * 8));
        }, 0) >>> 0
    );
  }
  /**
   * Read a unsigned integer as a bigint
   * @param bytes How many bytes the data is
   * @returns The parsed unsigned integer (as a bigint)
   */
  readUnsignedIntBigint(bytes: number) {
    return maybePromiseThen(this.readEndian(bytes), (read) => {
      let output: bigint = 0n;
      for (let index = 0; index < bytes; index++) {
        output <<= 8n;
        output |= BigInt(read[index]);
      }
      return output;
    });
  }
  /**
   * Parse a two's complement
   * @param bytes How many bytes it is
   * @returns The parsed twos complement
   */
  readTwosComplement(bytes: number) {
    return maybePromiseThen(this.readUnsignedInt(bytes), (read) => {
      const bits = bytes * 8;
      // Just pad the value with 1s
      return (read & (1 << (bits - 1))) !== 0
        ? (constants.allOnes << bits) | read
        : read;
    });
  }
  /**
   * Parse a two's complement as a bigint
   * @param bytes How many bytes it is
   * @returns The parsed twos complement (as a bigint)
   */
  readTwosComplementBigint(bytes: number) {
    return maybePromiseThen(this.readUnsignedIntBigint(bytes), (read) => {
      const bits = BigInt(bytes * 8);
      // Just pad the value with 1s
      return (read & (1n << (bits - 1n))) !== 0n ? (-1n << bits) | read : read;
    });
  }
  /**
   * Parse a two's complement from a single byte
   * @returns The parsed twos complement
   */
  readTwosComplementByte() {
    return maybePromiseThen(this.shift(), (byte) =>
      byte & 0b10000000 ? byte | constants.allOnesButLastByte : byte
    );
  }
  /**
   * Parse a two's complements from single bytes
   * @param bytes How many two's complements to parse
   * @returns The parsed twos complements
   */
  readTwosComplementByteArray(bytes: number) {
    return maybeAsyncCallArr(
      this.readTwosComplementByte.bind(this),
      Array(bytes).fill([])
    );
  }
  /**
   * Parse a float
   * @returns The parsed float
   */
  readFloat() {
    if (isBigEndian) {
      return maybePromiseThen(this.readEndian(4), (read) => {
        uint8Float32ArrayView.set(read);
        return float32Array[0];
      });
    } else {
      return maybePromiseThen(this.readBackwardsEndian(4), (read) => {
        uint8Float32ArrayView.set(read);
        return float32Array[0];
      });
    }
  }
  /**
   * Parse a double
   * @returns The parsed float
   */
  readDouble() {
    if (isBigEndian) {
      return maybePromiseThen(this.readEndian(4), (read) => {
        uint8Float64ArrayView.set(read);
        return float64Array[0];
      });
    } else {
      return maybePromiseThen(this.readBackwardsEndian(4), (read) => {
        uint8Float64ArrayView.set(read);
        return float64Array[0];
      });
    }
  }
  /**
   * Parse a string
   * @param bytes How many bytes long the string is
   * @param [mutf8=false] If the string is mutf8
   * @returns The parsed string
   */
  readString(bytes: number, mutf8: boolean = false) {
    if (mutf8 === true) {
      return maybePromiseThen(this.readUint8ArrayEndian(bytes), (read) =>
        decodeMutf8(read)
      );
    }
    return maybePromiseThen(this.readUint8ArrayEndian(bytes), (read) =>
      decodeUtf8(read)
    );
  }
  /**
   * Parse a signed one's complement
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed ones compement
   */
  readSignedOnesComplement(bytes: number) {
    const bits = bytes * 8;
    return maybePromiseThen(this.readUnsignedInt(bytes), (read) =>
      (read & (1 << (bits - 1))) !== 0
        ? -(~read & (constants.allOnes >>> (33 - bits)))
        : read
    );
  }
  /**
   * Parse a signed one's complement as a bigint
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed ones compement (as a bigint)
   */
  readSignedOnesComplementBigint(bytes: number) {
    const bits = BigInt(bytes * 8);
    return maybePromiseThen(this.readUnsignedIntBigint(bytes), (read) =>
      (read & (1n << (bits - 1n))) !== 0n
        ? -(~read & ~(-1n << (bits - 1n)))
        : read
    );
  }
  /**
   * Parse a signed one's complement from a byte
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed one's compement
   */
  readSignedOnesComplementByte() {
    // Possible: We invert the bits then 0 the first bit if the origional has the first bit as one, so the removal of the first bit is kind of useless. (By first bit I mean 0b10000000)
    return maybePromiseThen(this.shift(), (byte) =>
      byte & 0b10000000 ? -(~byte & 0b01111111) : byte
    );
  }
  /**
   * Parse signed one's complements (one byte each) from bytes
   * @param bytes How many one's complements to read
   * @returns The parsed signed one's compements
   */
  readSignedOnesComplementByteArray(bytes: number) {
    return maybeAsyncCallArr(
      this.readSignedOnesComplementByte.bind(this),
      Array(bytes).fill([])
    );
  }
  /**
   * Parse a signed integer
   * @param bytes How many bytes long the signed integer is
   * @returns The parsed signed integer
   */
  readSignedInteger(bytes: number) {
    const bits = bytes * 8;
    return maybePromiseThen(this.readUnsignedInt(bytes), (read) => {
      const sign = read & (1 << (bits - 1));
      return sign === 0 ? read ^ sign : -(read ^ sign);
    });
  }
  /**
   * Parse a signed integer as a bigint
   * @param bytes How many bytes long the signed integer is
   * @returns The parsed signed integer (as a bigint)
   */
  readSignedIntegerBigint(bytes: number) {
    const bits = BigInt(bytes * 8);
    return maybePromiseThen(this.readUnsignedIntBigint(bytes), (read) => {
      const sign = read & (1n << (bits - 1n));
      return sign === 0n ? read ^ sign : -(read ^ sign);
    });
  }
  /**
   * Parse a signed integer from a byte
   * @returns The parsed signed integer
   */
  readSignedIntegerByte() {
    return maybePromiseThen(this.shift(), (byte) =>
      byte & 0b10000000 ? -(byte & 0b01111111) : byte & 0b01111111
    );
  }
  /**
   * Parse a signed integer from a byte
   * @returns The parsed signed integers
   */
  readSignedIntegerByteArray(bytes: number) {
    return maybeAsyncCallArr(
      this.readSignedIntegerByte.bind(this),
      Array(bytes).fill([])
    );
  }
}

export const readableBufferBaseAsync = readableBufferBase;

export class readableBuffer extends readableBufferBase {
  #buffer: Uint8Array;
  #index: number = 0;
  constructor(data: Uint8Array | readableBuffer) {
    super();
    if (data instanceof readableBuffer) {
      this.#buffer = data.#buffer;
      this.#index = data.#index;
    } else {
      this.#buffer = data;
    }
  }
  get buffer(): Uint8Array {
    return this.#buffer.slice(this.#index);
  }
  set buffer(newValue: Uint8Array | readableBuffer | Buffer) {
    if (newValue instanceof readableBuffer) {
      this.#buffer = newValue.#buffer;
      this.#index = newValue.#index;
    } else {
      this.#buffer = newValue;
      this.#index = 0;
    }
  }
  get _offset() {
    return this.#index;
  }
  shift(): number {
    if (this.#buffer.length < ++this.#index) {
      throw new RangeError("readableBuffer out of bounds");
    }
    return this.#buffer[this.#index - 1];
  }
  readUint8Array(bytes: number): Uint8Array {
    return this.#buffer.slice(this.#index, (this.#index += bytes));
  }
  readReadableBuffer(bytes: number): readableBuffer {
    // This uses the same memory for the new readableBuffer
    return new readableBuffer(
      this.#buffer.subarray(this.#index, (this.#index += bytes))
    );
  }
  read(bytes: number): number[] {
    const output = Array.prototype.slice.call(
      this.#buffer,
      this.#index,
      (this.#index += bytes)
    );
    if (output.length !== bytes) {
      throw new RangeError("readableBuffer out of bounds");
    }
    return output;
  }
  // This is a bit more usefull in writableBuffer
  readBackwards(bytes: number): number[] {
    return this.read(bytes).reverse();
  }
}
export const readableBufferLe = addDefaultEndianness(readableBuffer, true);
