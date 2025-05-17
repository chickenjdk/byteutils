import { encodeMutf8, encodeUtf8 } from "./utf8tools";
import {
  addDefaultEndianness,
  float32Array,
  float64Array,
  isBigEndian,
  uint8Float32ArrayView,
  uint8Float64ArrayView,
  wrapForPromise,
  wrapForAsyncCallArr,
} from "./common";
import { uint8ArrayLike, cloneFunc } from "./types";
const constants = {
  // 11111111111111111111111111111111
  allOnes: 0xffffffff,
  // 10000000000000000000000000000000
  oneThen31Zeros: 0x80000000,
  // 11111111111111111111111100000000
  allOnesButLastByte: 0xffffff00,
};
export abstract class writableBufferBase {
  // Methods to implement
  /**
   * Write data to the buffer (first byte first written to the end[BE])
   * @param value The data to write
   */
  abstract write(value: uint8ArrayLike): void | Promise<void>;
  /**
   * Write data to the buffer backwards (last byte first written to the end[LE])
   */
  abstract writeBackwards(value: uint8ArrayLike): void | Promise<void>;
  /**
   * Push a byte to the buffer's end
   * @param value the byte to push
   */
  abstract push(value: number): void | Promise<void>;
  /**
   * Write a Uint8Array to the buffer (first byte first written to the end[BE])
   * Alias for .write because .write can handle Uint8Arrays. This exsists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8Array = this.write;
  /**
   * White a writeable buffer storing data to the buffer
   */
  writeWriteableBuffer(value: writableBufferStorage): void | Promise<void> {
    this.write(Array.prototype.slice.call(value.buffer, 0));
  }
  // Little-endian support: <-
  /**
   * Write data to the buffer (writes data that was origionaly in BE format to the endianness of the buffer)
   * @param value The data to write
   */
  writeEndian: cloneFunc<typeof this.write | typeof this.writeBackwards> =
    this.write;
  /**
   * Write data to the buffer backwards (writes data that was origionaly in LE format to the endianness of the buffer, I know that "backwards" is a little opinionated but the class was origionaly BE-only and I did not want to change too mutch)
   * @param value The data to write
   */
  writeBackwardsEndian: cloneFunc<
    typeof this.write | typeof this.writeBackwards
  > = this.writeBackwards;
  /**
   * Write a Uint8Array to the buffer (for the endian)
   * Alias for .write because .write can handle Uint8Arrays. This exsists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8ArrayEndian: cloneFunc<
    typeof this.write | typeof this.writeBackwards
  > = this.write;
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
      this.writeEndian = this.writeBackwards;
      this.writeBackwardsEndian = this.write;
      this.writeUint8ArrayEndian = this.writeBackwards;
    } else {
      this.writeEndian = this.write;
      this.writeBackwardsEndian = this.writeBackwards;
      this.writeUint8ArrayEndian = this.write;
    }
    this.#isLe = isLe;
  }
  // ->
  // REMEMBER: return type is not specifyed so if writeEndian or whatever is not async, promise will hopefully be removed from the return type via wrapForPromise dynamic return type
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write
   * @param bytes How many bytes the unsined int is (If not provided, it will write the minimum length)
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeUnsignedInt(value: number, bytes?: number) {
    let mask = 0b11111111;
    let out: number[] = [];
    let i = -8;
    bytes ||= Math.ceil((32 - Math.clz32(value)) / 8);
    const bits = bytes * 8;
    while ((i += 8) < bits) {
      out.unshift((mask & value) >>> i);
      mask <<= 8;
    }
    return wrapForPromise(this.writeEndian(out), bytes);
  }
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write (a bigint)
   * @param bytes How many bytes the unsined int is (If not provided, it will write the minimum length)
   * @returns How many bytes were written (Same as bytes parameter)
   */
  writeUnsignedIntBigint(value: bigint, bytes: number) {
    let mask = 0b11111111n;
    let out: number[] = [];
    let i = -8n;
    const bits = bytes * 8;
    while ((i += 8n) < bits) {
      out.unshift(Number((mask & value) >> i));
      mask <<= 8n;
    }
    return wrapForPromise(this.writeEndian(out), bytes);
  }
  /**
   * Write a twos complement to the buffer
   * @param value The number to encode
   * @param bytes How long the twos complement to be written is in bytes
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeTwosComplement(value: number, bytes?: number) {
    const bitsLength = 32 - Math.clz32(Math.abs(value));
    bytes ||= Math.ceil((bitsLength + 1) / 8);
    return wrapForPromise(
      this.writeUnsignedInt(
        value < 0
          ? ((constants.allOnes >>> ((4 - bytes) * 8)) & value) >>> 0
          : value,
        bytes
      ),
      bytes
    );
  }
  /**
   * Write a twos complement to the buffer (From a bigint)
   * @param value The number to encode
   * @param bytes How long the twos complement to be written is in bytes
   * @returns How many bytes were written (Same as bytes parameter)
   */
  writeTwosComplementBigint(value: bigint, bytes: number) {
    return wrapForPromise(
      this.writeUnsignedIntBigint(
        value < 0n ? ~(-1n << BigInt(bytes * 8)) & value : value,
        bytes
      ),
      bytes
    );
  }
  /**
   * Write a twos complement to the buffer (one byte)
   * @param value The number to encode
   */
  writeTwosComplementByte(value: number) {
    return wrapForPromise(void 0, this.push((value & 0b11111111) >>> 0));
  }
  /**
   * Write twos complements to the buffer (one byte each)
   * @param values The numbers to encode
   */
  writeTwosComplementByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeTwosComplementByte.bind(this),
      values.map((value) => [value]),
      void 0
    );
  }
  /**
   * Write a float to the buffer
   * @param value The float to write
   */
  writeFloat(value: number) {
    float32Array[0] = value;
    // Typed arrays are endian-dependent, so if the computer is little-endian, the output will be in little-endian format
    if (isBigEndian) {
      return wrapForPromise(void 0, this.writeEndian(uint8Float32ArrayView));
    } else {
      return wrapForPromise(
        void 0,
        this.writeBackwardsEndian(uint8Float32ArrayView)
      );
    }
  }
  /**
   * Write a double float to the buffer
   * @param value The double float to write
   */
  writeDouble(value: number): void | Promise<void> {
    float64Array[0] = value;
    if (isBigEndian) {
      return wrapForPromise(void 0, this.writeEndian(uint8Float64ArrayView));
    } else {
      return wrapForPromise(
        void 0,
        this.writeBackwardsEndian(uint8Float64ArrayView)
      );
    }
  }
  /**
   * Write a utf8 string to the buffer
   * @param value
   * @param mutf8 If true, write in java's mutf8 format instead
   * @returns How many bytes were written
   */
  writeString(value: string, mutf8: boolean = false): number | Promise<number> {
    let encoded: uint8ArrayLike;
    if (mutf8 === true) {
      encoded = encodeMutf8(value);
    } else {
      encoded = encodeUtf8(value);
    }
    return wrapForPromise(this.write(encoded), encoded.length);
  }
  /**
   * Encode and write a signed one's complement
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeSignedOnesComplement(
    value: number,
    bytes?: number
  ): number | Promise<number> {
    bytes ||= Math.ceil((33 - Math.clz32(Math.abs(value))) / 8);
    return wrapForPromise(
      this.writeUnsignedInt(
        value < 0
          ? (value - 1) & (constants.allOnes >>> (32 - bytes * 8))
          : // Rely on the user not to use to big of a value
            value /* & (constants.allOnes >>> (32 - bytes * 8))*/,
        bytes
      ),
      bytes
    );
  }
  /**
   * Encode and write a signed ones complement (from a bigint)
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter)
   */
  writeSignedOnesComplementBigint(
    value: bigint,
    bytes: number
  ): number | Promise<number> {
    return wrapForPromise(
      this.writeUnsignedIntBigint(
        value < 0n
          ? (value - 1n) & ~(-1n << BigInt(32 - bytes * 8))
          : // Rely on the user not to use to big of a value
            value /* & (constants.allOnes >>> (32 - bytes * 8))*/,
        bytes
      ),
      bytes
    );
  }
  /**
   * Encode and write a signed ones complement (one byte)
   * @param value The number to encode
   */
  writeSignedOnesComplementByte(value: number) {
    return wrapForPromise(
      this.push(value < 0 ? (value - 1) & 0xff : value),
      void 0
    );
  }
  /**
   * Encode and write a signed ones complements
   * @param values The numbers to encode
   */
  writeSignedOnesComplementByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeSignedOnesComplementByte.bind(this),
      values.map((value) => [value]),
      void 0
    );
  }
  /**
   * Encode and write a signed integer
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeSignedInteger(value: number, bytes?: number) {
    const absValue = Math.abs(value);
    bytes ||= Math.ceil((33 - Math.clz32(absValue)) / 8);
    const bits = bytes * 8;
    return wrapForPromise(
      this.writeUnsignedInt(
        value < 0
          ? // Rely on the user not to use to big of a value
            absValue | (1 << (bits - 1)) // & (constants.allOnes >>> (32 - bits))
          : value,
        bytes
      ),
      bytes
    );
  }
  /**
   * Encode and write a signed integer (from a bigint)
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter)
   */
  writeSignedIntegerBigint(value: bigint, bytes: number) {
    // const oneLiner = (value,bytes) =>  value < 0n ? -value | (1n << (BigInt(bytes*8) - 1n)) : value;
    const bits = BigInt(bytes * 8);
    return wrapForPromise(
      this.writeUnsignedIntBigint(
        value < 0n
          ? // Rely on the user not to use to big of a value
            -value | (1n << (bits - 1n)) // & ~(-1n << bits)
          : value,
        bytes
      ),
      bytes
    );
  }
  /**
   * Encode and write a signed integer (one byte)
   * @param value The number to encode
   */
  writeSignedIntegerByte(value: number) {
    return wrapForPromise(
      this.push(value < 0 ? 0b10000000 | -value : value),
      void 0
    );
  }
  /**
   * Encode and write signed integers (one byte)
   * @param values The numbers to encode
   */
  writeSignedIntegerByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeSignedIntegerByte.bind(this),
      values.map((value) => [value]),
      void 0
    );
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
export const writableBufferResizeLE = addDefaultEndianness(
  writableBufferResize,
  true
);
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
      this.write(value instanceof writableBufferBase ? value.buffer : value);
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
export const writableBufferChunkArrayLE = addDefaultEndianness(
  writableBufferChunkArray,
  true
);
export const writableBuffer = writableBufferChunkArray;
export const writableBufferLE = writableBufferChunkArrayLE;
