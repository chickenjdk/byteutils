import { encodeMutf8, encodeUtf8 } from "./utf8tools";
import {
  float32Array,
  float64Array,
  isBigEndian,
  uint8Float32ArrayView,
  uint8Float64ArrayView,
} from "./common";
import { oneByteMax, uint8ArrayLike } from "./types";
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
  abstract write(value: uint8ArrayLike): void;
  abstract writeBackwards(value: uint8ArrayLike): void;
  abstract push(value: oneByteMax): void;
  /**
   * Alias for .write because .write can handle Uint8Arrays. This exsists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8Array = this.write;
  writeWriteableBuffer(value: writableBuffer): void {
    this.write(Array.prototype.slice.call(value.buffer, 0));
  }
  writeUnsignedInt(value: number, bytes?: number): void {
    let mask = 0b11111111;
    let out:oneByteMax[] = [];
    let i = -8;
    bytes ||= Math.ceil((32 - Math.clz32(value)) / 8);
    const bits = bytes * 8;
    while ((i += 8) < bits) {
      out.unshift((mask & value) >>> i as oneByteMax);
      mask <<= 8;
    }
    this.write(out);
  }
  writeUnsignedIntBigint(value: bigint, bytes: number): void {
    let mask = 0b11111111n;
    let out: number[] = [];
    let i = -8n;
    const bits = bytes * 8;
    while ((i += 8n) < bits) {
      out.unshift(Number((mask & value) >> i));
      mask <<= 8n;
    }
    this.write(out as oneByteMax[]);
  }
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
  writeTwosComplementBigint(value: bigint, bytes: number) {
    this.writeUnsignedIntBigint(
      value < 0n ? ~(-1n << BigInt(bytes * 8)) & value : value,
      bytes
    );
  }
  writeTwosComplementByte(value: number): void {
    this.push(((value & 0b11111111) >>> 0) as oneByteMax);
  }
  writeTwosComplementByteArray(values: number[]): void {
    values.forEach(this.writeTwosComplementByte.bind(this));
  }
  writeFloat(value: number): void {
    float32Array[0] = value;
    // Typed arrays are endian-dependent, so if the computer is little-endian, the output will be in little-endian format
    // I don't know mutch endian jargon ( yet ) so please forgive my lack of jargon.
    if (isBigEndian) {
      // Come ON typescript ( Wait, it is DT's fault. They wrote the defs, not typescript.
      this.write(uint8Float32ArrayView as uint8ArrayLike);
    } else {
      this.writeBackwards(uint8Float32ArrayView as uint8ArrayLike);
    }
  }
  writeDouble(value: number): void {
    float64Array[0] = value;
    if (isBigEndian) {
      // Come ON typescript ( Wait, it is DT's fault. They wrote the defs, not typescript.
      this.write(uint8Float64ArrayView as uint8ArrayLike);
    } else {
      this.writeBackwards(uint8Float64ArrayView as uint8ArrayLike);
    }
  }
  writeString<returnLength extends boolean = false>(
    value: string,
    mutf8: boolean = false,
    returnLength?: returnLength,
    ...cb: returnLength extends true ? [(length: number) => void] : []
  ): void {
    if (returnLength) {
      let encoded: uint8ArrayLike;
      if (mutf8 === true) {
        encoded = encodeMutf8(value) as uint8ArrayLike;
      } else {
        encoded = encodeUtf8(value) as uint8ArrayLike;
      }
      (cb[0] as (length: number) => void)(encoded.length);
      this.write(encoded);
    } else {
      if (mutf8 === true) {
        this.write(encodeMutf8(value) as uint8ArrayLike);
      } else {
        this.write(encodeUtf8(value) as uint8ArrayLike);
      }
    }
  }
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
  writeSignedOnesComplementBigint(value: bigint, bytes: number) {
    this.writeUnsignedIntBigint(
      value < 0n
        ? (value - 1n) & ~(-1n << BigInt(32 - bytes * 8))
        : // Rely on the user not to use to big of a value
          value /* & (constants.allOnes >>> (32 - bytes * 8))*/,
      bytes
    );
  }
  writeSignedOnesComplementByte(value: number): void {
    this.push(
      value < 0 ? (((value - 1) & 0xff) as oneByteMax) : (value as oneByteMax)
    );
  }
  writeSignedOnesComplementByteArray(values: number[]): void {
    values.forEach(this.writeSignedOnesComplementByte.bind(this));
  }
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
  writeSignedIntegerByte(value: number): void {
    this.push((value < 0 ? 0b10000000 | -value : value) as oneByteMax);
  }
  writeSignedIntegerByteArray(values: number[]): void {
    values.forEach(this.writeSignedIntegerByte.bind(this));
  }
}
export class writableBuffer extends writableBufferBase {
  #buffer: Uint8Array;
  get buffer(): Uint8Array {
    return this.#buffer.slice(0);
  }
  /**
   * Change the buffer of exsisting data.
   * If a Uint8Array (or buffer) is pased, and it is not resizeable, it copys the bytes of the buffer
   */
  set buffer(newValue: Uint8Array | Buffer | writableBuffer) {
    const buffer =
      newValue instanceof writableBuffer ? newValue.#buffer : newValue;
    // @ts-ignore
    if (buffer.buffer.resizable) {
      this.#buffer = buffer;
    } else {
      // Copy the buffers bytes
      // @ts-ignore
      this.#buffer.buffer.resize(buffer.length);
      buffer.forEach((value, index) => {
        this.#buffer[index] = value;
      });
    }
  }
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
  push(value: oneByteMax): void {
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
}
