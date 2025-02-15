import { decodeMutf8, decodeUtf8 } from "./utf8tools";
import {
  float32Array,
  uint8Float32ArrayView,
  float64Array,
  uint8Float64ArrayView,
  isBigEndian,
} from "./common";
import type { asyncify } from "./types";
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
  abstract shift(): number;
  /**
   * Read a Uint8Array from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract readUint8Array(bytes: number): Uint8Array;
  /**
   * Read a ReadableBuffer from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract readReadableBuffer(bytes: number): readableBuffer;
  /**
   * Read a number array (0-255) from the start of the buffer
   * @param bytes How many bytes to read
   */
  abstract read(bytes: number): number[];
  /**
   * Read a number array (0-255) from the start of the buffer backwards
   * @param bytes How many bytes to read
   */
  abstract readBackwards(bytes: number): number[];
  // "real" code
  /**
   * Read a unsigned integer
   * @param bytes How many bytes the data is
   * @returns The parsed unsigned integer
   */
  readUnsignedInt(bytes: number): number {
    return (
      this.read(bytes)
        .reverse()
        .reduce(function (creating, byte, index): number {
          return creating | (byte << (index * 8));
        }, 0) >>> 0
    );
  }
  /**
   * Read a unsigned integer as a bigint
   * @param bytes How many bytes the data is
   * @returns The parsed unsigned integer (as a bigint)
   */
  readUnsignedIntBigint(bytes: number): bigint {
    const read = this.read(bytes);
    let output: bigint = 0n;
    for (let index = 0; index < bytes; index++) {
      output <<= 8n;
      output |= BigInt(read[index]);
    }
    return output;
  }
  /**
   * Parse a two's complement
   * @param bytes How many bytes it is
   * @returns The parsed twos complement
   */
  readTwosComplement(bytes: number): number {
    const value = this.readUnsignedInt(bytes);
    const bits = bytes * 8;
    // Just pad the value with 1s
    return (value & (1 << (bits - 1))) !== 0
      ? (constants.allOnes << bits) | value
      : value;
  }
  /**
   * Parse a two's complement as a bigint
   * @param bytes How many bytes it is
   * @returns The parsed twos complement (as a bigint)
   */
  readTwosComplementBigint(bytes: number): bigint {
    const value = this.readUnsignedIntBigint(bytes);
    const bits = BigInt(bytes * 8);
    // Just pad the value with 1s
    return (value & (1n << (bits - 1n))) !== 0n ? (-1n << bits) | value : value;
  }
  /**
   * Parse a two's complement from a single byte
   * @returns The parsed twos complement
   */
  readTwosComplementByte(): number {
    const byte = this.shift();
    return byte & 0b10000000 ? byte | constants.allOnesButLastByte : byte;
  }
  /**
   * Parse a two's complements from single bytes
   * @param bytes How many two's complements to parse
   * @returns The parsed twos complements
   */
  readTwosComplementByteArray(bytes: number): number[] {
    return Array(bytes)
      .fill(undefined)
      .map(this.readTwosComplementByte.bind(this));
  }
  /**
   * Parse a float
   * @returns The parsed float
   */
  readFloat(): number {
    if (isBigEndian) {
      uint8Float32ArrayView.set(this.read(4));
      return float32Array[0];
    } else {
      uint8Float32ArrayView.set(this.readBackwards(4));
      return float32Array[0];
    }
  }
  /**
   * Parse a double
   * @returns The parsed float
   */
  readDouble(): number {
    if (isBigEndian) {
      uint8Float64ArrayView.set(this.read(8));
      return float64Array[0];
    } else {
      uint8Float64ArrayView.set(this.readBackwards(8));
      return float64Array[0];
    }
  }
  /**
   * Parse a string
   * @param bytes How many bytes long the string is
   * @param [mutf8=false] If the string is mutf8
   * @returns The parsed string
   */
  readString(bytes: number, mutf8: boolean = false): string {
    if (mutf8 === true) {
      return decodeMutf8(this.readUint8Array(bytes));
    }
    return decodeUtf8(this.readUint8Array(bytes));
  }
  /**
   * Parse a signed one's complement
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed ones compement
   */
  readSignedOnesComplement(bytes: number): number {
    const bits = bytes * 8;
    const value = this.readUnsignedInt(bytes);
    return (value & (1 << (bits - 1))) !== 0
      ? -(~value & (constants.allOnes >>> (33 - bits)))
      : value;
  }
  /**
   * Parse a signed one's complement as a bigint
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed ones compement (as a bigint)
   */
  readSignedOnesComplementBigint(bytes: number): bigint {
    const bits = BigInt(bytes * 8);
    const value = this.readUnsignedIntBigint(bytes);
    return (value & (1n << (bits - 1n))) !== 0n
      ? -(~value & ~(-1n << (bits - 1n)))
      : value;
  }
  /**
   * Parse a signed one's complement from a byte
   * @param bytes How long the signed one's complement is
   * @returns The parsed signed one's compement
   */
  readSignedOnesComplementByte(): number {
    const byte = this.shift();
    return byte & 0b10000000 ? -(~byte & 0b01111111) : byte;
  }
  /**
   * Parse signed one's complements (one byte each) from bytes
   * @param bytes How many one's complements to read
   * @returns The parsed signed one's compements
   */
  readSignedOnesComplementByteArray(bytes: number): number[] {
    return Array(bytes)
      .fill(undefined)
      .map(this.readSignedOnesComplementByte.bind(this));
  }
  /**
   * Parse a signed integer
   * @param bytes How many bytes long the signed integer is
   * @returns The parsed signed integer
   */
  readSignedInteger(bytes: number): number {
    const bits = bytes * 8;
    const value = this.readUnsignedInt(bytes);
    const sign = value & (1 << (bits - 1));
    return sign === 0 ? value ^ sign : -(value ^ sign);
  }
  /**
   * Parse a signed integer as a bigint
   * @param bytes How many bytes long the signed integer is
   * @returns The parsed signed integer (as a bigint)
   */
  readSignedIntegerBigint(bytes: number): bigint {
    const bits = BigInt(bytes * 8);
    const value = this.readUnsignedIntBigint(bytes);
    const sign = value & (1n << (bits - 1n));
    return sign === 0n ? value ^ sign : -(value ^ sign);
  }
  /**
   * Parse a signed integer from a byte
   * @returns The parsed signed integer
   */
  readSignedIntegerByte(): number {
    const byte = this.shift();
    return byte & 0b10000000 ? -(byte & 0b01111111) : byte & 0b01111111;
  }
  /**
   * Parse a signed integer from a byte
   * @returns The parsed signed integers
   */
  readSignedIntegerByteArray(bytes: number): number[] {
    return Array(bytes)
      .fill(undefined)
      .map(this.readSignedIntegerByte.bind(this));
  }
}
export abstract class readableBufferBaseAsync
  implements asyncify<readableBufferBase>
{
  // Methods to implement
  abstract shift(): Promise<number>;
  abstract readUint8Array(bytes: number): Promise<Uint8Array>;
  abstract readReadableBuffer(bytes: number): Promise<readableBuffer>;
  abstract read(bytes: number): Promise<number[]>;
  abstract readBackwards(bytes: number): Promise<number[]>;
  // "real" code
  async readUnsignedInt(bytes: number): Promise<number> {
    return (
      (await this.read(bytes))
        .reverse()
        .reduce(function (creating, byte, index): number {
          return creating | (byte << (index * 8));
        }, 0) >>> 0
    );
  }
  async readUnsignedIntBigint(bytes: number): Promise<bigint> {
    const read = await this.read(bytes);
    let output: bigint = 0n;
    for (let index = 0; index < bytes; index++) {
      output <<= 8n;
      output |= BigInt(read[index]);
    }
    return output;
  }
  async readTwosComplement(bytes: number): Promise<number> {
    const value = await this.readUnsignedInt(bytes);
    const bits = bytes * 8;
    // Just pad the value with 1s
    return (value & (1 << (bits - 1))) !== 0
      ? (constants.allOnes << bits) | value
      : value;
  }
  async readTwosComplementBigint(bytes: number): Promise<bigint> {
    const value = await this.readUnsignedIntBigint(bytes);
    const bits = BigInt(bytes * 8);
    // Just pad the value with 1s
    return (value & (1n << (bits - 1n))) !== 0n ? (-1n << bits) | value : value;
  }
  async readTwosComplementByte(): Promise<number> {
    const byte = await this.shift();
    return byte & 0b10000000 ? byte | constants.allOnesButLastByte : byte;
  }
  async readTwosComplementByteArray(bytes: number): Promise<number[]> {
    const output: number[] = [];
    for (let index = 0; index < bytes; index++) {
      output.push(await this.readTwosComplementByte());
    }
    return output;
  }
  async readFloat(): Promise<number> {
    if (isBigEndian) {
      uint8Float32ArrayView.set(await this.read(4));
      return float32Array[0];
    } else {
      uint8Float32ArrayView.set(await this.readBackwards(4));
      return float32Array[0];
    }
  }
  async readDouble(): Promise<number> {
    if (isBigEndian) {
      uint8Float64ArrayView.set(await this.read(8));
      return float64Array[0];
    } else {
      uint8Float64ArrayView.set(await this.readBackwards(8));
      return float64Array[0];
    }
  }
  async readString(bytes: number, mutf8: boolean = false): Promise<string> {
    if (mutf8 === true) {
      return decodeMutf8(await this.readUint8Array(bytes));
    }
    return decodeUtf8(await this.readUint8Array(bytes));
  }
  async readSignedOnesComplement(bytes: number): Promise<number> {
    const bits = bytes * 8;
    const value = await this.readUnsignedInt(bytes);
    return (value & (1 << (bits - 1))) !== 0
      ? -(~value & (constants.allOnes >>> (33 - bits)))
      : value;
  }
  async readSignedOnesComplementBigint(bytes: number): Promise<bigint> {
    const bits = BigInt(bytes * 8);
    const value: bigint = await this.readUnsignedIntBigint(bytes);
    return (value & (1n << (bits - 1n))) !== 0n
      ? -(~value & ~(-1n << (bits - 1n)))
      : value;
  }
  async readSignedOnesComplementByte(): Promise<number> {
    const byte = await this.shift();
    return byte & 0b10000000 ? -(~byte & 0b01111111) : byte;
  }
  async readSignedOnesComplementByteArray(bytes: number): Promise<number[]> {
    const output: number[] = [];
    for (let index = 0; index < bytes; index++) {
      output.push(await this.readSignedOnesComplementByte());
    }
    return output;
  }
  async readSignedInteger(bytes: number): Promise<number> {
    const bits = bytes * 8;
    const value = await this.readUnsignedInt(bytes);
    const sign = value & (1 << (bits - 1));
    return sign === 0 ? value ^ sign : -(value ^ sign);
  }
  async readSignedIntegerBigint(bytes: number): Promise<bigint> {
    const bits = BigInt(bytes * 8);
    const value = await this.readUnsignedIntBigint(bytes);
    const sign = value & (1n << (bits - 1n));
    return sign === 0n ? value ^ sign : -(value ^ sign);
  }
  async readSignedIntegerByte(): Promise<number> {
    const byte = await this.shift();
    return byte & 0b10000000 ? -(byte & 0b01111111) : byte & 0b01111111;
  }
  async readSignedIntegerByteArray(bytes: number): Promise<number[]> {
    const output: number[] = [];
    for (let index = 0; index < bytes; index++) {
      output.push(await this.readSignedIntegerByte());
    }
    return output;
  }
}

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
