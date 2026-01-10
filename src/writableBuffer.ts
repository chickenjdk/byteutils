import { encodeMutf8, encodeUtf8 } from "./utf8tools";
import {
  joinUint8Arrays,
  addDefaultEndianness,
  float32Array,
  float64Array,
  isBigEndian,
  uint8Float32ArrayView,
  uint8Float64ArrayView,
  wrapForPromise,
  wrapForAsyncCallArr,
} from "./common";
import { uint8ArrayLike, cloneFunc, MaybePromise, mergeValues } from "./types";
const constants = {
  // 11111111111111111111111111111111
  allOnes: 0xffffffff,
  // 10000000000000000000000000000000
  oneThen31Zeros: 0x80000000,
  // 11111111111111111111111100000000
  allOnesButLastByte: 0xffffff00,
};
// Returns not typed for non-abstract/abstract alias methods
export abstract class writableBufferBase<
  IsAsync extends boolean = true | false
> {
  // Methods to implement
  /**
   * Write a array of bytes (numbers 0-255) to the buffer (first byte first written to the end[BE])
   * @param value The data to write
   */
  abstract writeArray(value: number[]): MaybePromise<void, IsAsync>;
  /**
   * Write a array of bytes (numbers 0-255) to the buffer backwards (last byte first written to the end[LE])
   */
  abstract writeArrayBackwards(value: number[]): MaybePromise<void, IsAsync>;
  /**
   * Write a Uint8Array to the buffer (first byte first written to the end[BE])
   */
  abstract writeUint8Array(value: Uint8Array): MaybePromise<void, IsAsync>;
  /**
   * Write a Uint8Array to the buffer backward (last byte first written to the end[LE])
   */
  abstract writeUint8ArrayBackwards(
    value: Uint8Array
  ): MaybePromise<void, IsAsync>;
  /**
   * Push a byte (numbers 0-255) to the buffer's end
   * @param value the byte to push
   */
  abstract push(value: number): MaybePromise<void, IsAsync>;
  /**
   * Write a writeable buffer storing data to the buffer
   */
  writeWriteableBuffer(value: writableBufferStorage) {
    return this.writeUint8Array(value.buffer);
  }
  // Little-endian support: <-
  /**
   * Write data to the buffer (writes data that was originally in BE format to the endianness of the buffer)
   * @param value The data to write
   */
  writeArrayEndian:
    | cloneFunc<typeof this.writeArray>
    | cloneFunc<typeof this.writeArrayBackwards> = this.writeArray;
  /**
   * Write data to the buffer backwards (writes data that was originally in LE format to the endianness of the buffer, I know that "backwards" is a little opinionated but the class was origionaly BE-only and I did not want to change too mutch)
   * @param value The data to write
   */
  writeArrayBackwardsEndian:
    | cloneFunc<typeof this.writeArray>
    | cloneFunc<typeof this.writeArrayBackwards> = this.writeArrayBackwards;
  /**
   * Write a Uint8Array to the buffer (for the endian)
   * Alias for .write because .write can handle Uint8Arrays. This exists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8ArrayEndian:
    | cloneFunc<typeof this.writeUint8Array>
    | cloneFunc<typeof this.writeUint8ArrayBackwards> = this.writeUint8Array;
  /**
   * Write a Uint8Array to the buffer backwards (for the endian)
   * Alias for .write because .write can handle Uint8Arrays. This exists to have the similar naming of methods as readableBuffer's methods
   */
  writeUint8ArrayBackwardsEndian:
    | cloneFunc<typeof this.writeUint8Array>
    | cloneFunc<typeof this.writeUint8ArrayBackwards> =
    this.writeUint8ArrayBackwards;
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
      this.writeArrayEndian = this.writeArrayBackwards;
      this.writeArrayBackwardsEndian = this.writeArray;
      this.writeUint8ArrayEndian = this.writeUint8ArrayBackwards;
      this.writeUint8ArrayBackwardsEndian = this.writeUint8Array;
    } else {
      this.writeArrayEndian = this.writeArray;
      this.writeArrayBackwardsEndian = this.writeArrayBackwards;
      this.writeUint8ArrayEndian = this.writeUint8Array;
      this.writeUint8ArrayBackwardsEndian = this.writeUint8ArrayBackwards;
    }
    this.#isLe = isLe;
  }
  // ->
  // REMEMBER: return type is not specified so the isasync param properly propagates
  /**
   * Calculate the minimum length of an unsigned integer in bytes.
   * WARNING: No unsigned ints above 4294967295 (2^32 - 1) are supported, so this will not work for those.
   * This is due to the limitations of bitwise operators. You can write numbers higher than that via writeUnsignedIntBigint, but this function will not work for them.
   * @remarks
   * This function calculates the minimum number of bytes needed to represent an unsigned integer in binary format.
   * It uses the `Math.clz32` function to count the number of leading zeros in the binary representation of the value.
   * The result is rounded up to the nearest byte.
   * @param value The value to check
   * @returns The calculated minimum length in bytes
   */
  minLengthOfUnsignedInt(value: number) {
    return Math.ceil((32 - Math.clz32(value)) / 8);
  }
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write
   * @param bytes How many bytes the unsigned int is (If not provided, it will write the minimum length)
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeUnsignedInt(value: number, bytes: number) {
    let mask = 0b11111111; // The byte to grab
    let out: number[] = [];
    let i = -8;
    const bits = bytes * 8;
    // We grab the lowest bytes first, aka little endian
    while ((i += 8) < bits) {
      out.push((mask & value) >>> i);
      mask <<= 8;
    }
    return wrapForPromise(this.writeArrayBackwardsEndian(out), bytes);
  }
  /**
   * Write an unsigned integer to the buffer
   * @param value The unsigned int to write (a bigint)
   * @param bytes How many bytes the unsigned int is (If not provided, it will write the minimum length)
   * @returns How many bytes were written (Same as bytes parameter)
   */
  writeUnsignedIntBigint(value: bigint, bytes: number) {
    let mask = 0b11111111n; // The byte to grab
    let out: number[] = [];
    let i = -8n;
    const bits = bytes * 8;
    // We grab the lowest bytes first, aka little endian
    while ((i += 8n) < bits) {
      out.push(Number((mask & value) >> i));
      mask <<= 8n;
    }
    return wrapForPromise(this.writeArrayBackwardsEndian(out), bytes);
  }
  /**
   * Calculate the minimum length of a two's complement in bytes.
   * WARNING: No two's complements above 4278190079 or below -4278190079 (2^31 - 1) are supported, so this will not work for those.
   * This is due to the limitations of bitwise operators. You can write numbers higher than that via writeTwosComplementBigint, but this function will not work for them.
   * @remarks
   * This function calculates the minimum number of bytes needed to represent an two's complement in binary format.
   * It uses the `Math.clz32` function to count the number of leading zeros in the binary representation of the value.
   * It subtracts this from 33 (equivilent to the number of bits in the two's complement +1 to account for the sign) to get the number of bits needed.
   * The result is rounded up to the nearest byte.
   * @param value The value to check
   * @returns The calculated minimum length in bytes
   */
  minLengthOfTwosComplement(value: number) {
    // Length of the number as a unsigned int+1 is the bytes (to take into account the sign bit)
    // This is then converted to bytes
    return Math.ceil((33 - Math.clz32(Math.abs(value))) / 8);
  }
  /**
   * Write a twos complement to the buffer
   * @param value The number to encode
   * @param bytes How long the twos complement to be written is in bytes
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeTwosComplement(value: number, bytes: number) {
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
   * @returns How many bytes were written (1)
   */
  writeTwosComplementByte(value: number) {
    return wrapForPromise(this.push((value & 0b11111111) >>> 0), 1);
  }
  /**
   * Write twos complements to the buffer (one byte each)
   * @param values The numbers to encode
   * @returns How many bytes were written (Same as values.length)
   */
  writeTwosComplementByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeTwosComplementByte.bind(this),
      values.map((value) => [value]),
      values.length
    );
  }
  /**
   * Write a float to the buffer
   * @param value The float to write
   * @returns How many bytes were written (4)
   */
  writeFloat(value: number) {
    float32Array[0] = value;
    // Typed arrays are endian-dependent, so if the computer is little-endian, the output will be in little-endian format
    if (isBigEndian) {
      return wrapForPromise(
        this.writeUint8ArrayEndian(uint8Float32ArrayView),
        4
      );
    } else {
      return wrapForPromise(
        this.writeUint8ArrayBackwardsEndian(uint8Float32ArrayView),
        4
      );
    }
  }
  /**
   * Write a double float to the buffer
   * @param value The double float to write
   * @returns How many bytes were written (8)
   */
  writeDouble(value: number) {
    float64Array[0] = value;
    if (isBigEndian) {
      return wrapForPromise(
        this.writeUint8ArrayEndian(uint8Float64ArrayView),
        8
      );
    } else {
      return wrapForPromise(
        this.writeUint8ArrayBackwardsEndian(uint8Float64ArrayView),
        8
      );
    }
  }
  /**
   * Write a utf8 string to the buffer
   * @param value
   * @param mutf8 If true, write in java's mutf8 format instead. This was build for parsing java's .class files, so no complaining about it being a java-specific format.
   * @returns How many bytes were written
   */
  writeString(value: string, mutf8: boolean = false) {
    let encoded: Uint8Array;
    if (mutf8 === true) {
      encoded = encodeMutf8(value);
    } else {
      encoded = encodeUtf8(value);
    }
    return wrapForPromise(this.writeUint8Array(encoded), encoded.length);
  }
  /**
   * Calculate the minimum length of a signed ones's complement in bytes.
   * WARNING: No signed two's complements above 4278190079 or below -4278190079 (2^31 - 1) are supported, so this will not work for those.
   * This is due to the limitations of bitwise operators. You can write numbers higher than that via writeSignedOnesComplementBigint, but this function will not work for them.
   * @remarks
   * This function calculates the minimum number of bytes needed to represent an signed one's in binary format.
   * It uses the `Math.clz32` function to count the number of leading zeros in the binary representation of the value.
   * It subtracts this from 33 (equivalent to the number of bits in the signed one's complement +1 to account for the sign) to get the number of bits needed.
   * The result is rounded up to the nearest byte.
   * @param value The value to check
   * @returns The calculated minimum length in bytes
   */
  minLengthOfSignedOnesComplement(value: number) {
    // Length of the number as a unsigned int+1 is the bytes (to take into account the sign bit)
    // This is then converted to bytes
    return Math.ceil((33 - Math.clz32(Math.abs(value))) / 8);
  }
  /**
   * Encode and write a signed one's complement
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeSignedOnesComplement(value: number, bytes: number) {
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
  writeSignedOnesComplementBigint(value: bigint, bytes: number) {
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
   * @returns How many bytes were written (1)
   */
  writeSignedOnesComplementByte(value: number) {
    return wrapForPromise(this.push(value < 0 ? (value - 1) & 0xff : value), 1);
  }
  /**
   * Encode and write a signed ones complements
   * @param values The numbers to encode
   * @returns How many bytes were written (Same as values.length)
   */
  writeSignedOnesComplementByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeSignedOnesComplementByte.bind(this),
      values.map((value) => [value]),
      values.length
    );
  }
  /**
   * Calculate the minimum length of a signed integer in bytes.
   * WARNING: No signed integers above 4278190079 or below -4278190079 (2^31 - 1) are supported, so this will not work for those.
   * This is due to the limitations of bitwise operators. You can write numbers higher than that via writeSignedIntegerBigint, but this function will not work for them.
   * @remarks
   * This function calculates the minimum number of bytes needed to represent a signed integer in binary format.
   * It uses the `Math.clz32` function to count the number of leading zeros in the binary representation of the value.
   * It subtracts this from 33 (equivilent to the number of bits in the signed integer +1 to account for the sign) to get the number of bits needed.
   * The result is rounded up to the nearest byte.
   * @param value The value to check
   * @returns The calculated minimum length in bytes
   */
  minLengthOfSignedInteger(value: number) {
    // Length of the number as a unsigned int+1 is the bytes (to take into account the sign bit)
    // This is then converted to bytes
    return Math.ceil((33 - Math.clz32(Math.abs(value))) / 8);
  }
  /**
   * Encode and write a signed integer
   * @param value The number to encode
   * @param bytes How many bytes to make the encoded value
   * @returns How many bytes were written (Same as bytes parameter if provided)
   */
  writeSignedInteger(value: number, bytes: number) {
    const absValue = Math.abs(value);
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
   * @returns How many bytes were written (1)
   */
  writeSignedIntegerByte(value: number) {
    return wrapForPromise(
      this.push(value < 0 ? 0b10000000 | -value : value),
      1
    );
  }
  /**
   * Encode and write signed integers (one byte)
   * @param values The numbers to encode
   * @returns How many bytes were written (Same as values.length)
   */
  writeSignedIntegerByteArray(values: number[]) {
    return wrapForAsyncCallArr(
      this.writeSignedIntegerByte.bind(this),
      values.map((value) => [value]),
      values.length
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
export class writableBuffer
  extends writableBufferBase<false>
  implements writableBufferStorage
{
  #chunkSize: number;
  #buffers: Uint8Array[];
  #used: number = 0;
  get buffer(): Uint8Array {
    return joinUint8Arrays(
      [
        ...this.#buffers.slice(1),
        this.#buffers[0].subarray(0, this.#used),
      ],
      this.length
    );
  }
  set buffer(value: uint8ArrayLike | writableBufferStorage) {
    if (
      value instanceof writableBuffer &&
      value.#chunkSize === this.#chunkSize
    ) {
      this.#buffers = value.#buffers;
      this.#used = value.#used;
    } else {
      this.#buffers = [new Uint8Array(this.#chunkSize)];
      this.#used = 0;
      if (value instanceof writableBufferBase) {
        // Processing goes into getting this value, so don't grab it twice
        const buffer = value.buffer;
        if (buffer instanceof Uint8Array) {
          this.writeUint8Array(buffer);
          return;
        }
      }
      this.writeUint8Array(
        value instanceof Uint8Array
          ? value
          : new Uint8Array(value as uint8ArrayLike)
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
  writeUint8Array(value: Uint8Array): void {
    let bytesLeft = value.length;
    let index = 0;
    while (bytesLeft > 0) {
      if (this.#used === this.#chunkSize) {
        this.#used = 0;
        this.#buffers.unshift(new Uint8Array(this.#chunkSize));
      }
      const bytesToWrite = Math.min(bytesLeft, this.#chunkSize - this.#used);
      this.#buffers[0].set(
        value.subarray(index, index + bytesToWrite),
        this.#used
      );
      this.#used += bytesToWrite;
      index += bytesToWrite;
      bytesLeft -= bytesToWrite;
    }
  }
  writeUint8ArrayBackwards(value: Uint8Array): void {
    // Don't mutate the original value
    this.writeUint8Array(value.slice(0).reverse());
  }
  writeArray(value: number[]) {
    let bytesLeft = value.length;
    let index = 0;
    while (bytesLeft > 0) {
      if (this.#used === this.#chunkSize) {
        this.#used = 0;
        this.#buffers.unshift(new Uint8Array(this.#chunkSize));
      }
      const bytesToWrite = Math.min(bytesLeft, this.#chunkSize - this.#used);
      this.#buffers[0].set(
        value.slice(index, index + bytesToWrite),
        this.#used
      );
      this.#used += bytesToWrite;
      index += bytesToWrite;
      bytesLeft -= bytesToWrite;
    }
  }
  writeArrayBackwards(value: number[]) {
    this.writeArray(value.slice(0).reverse());
  }
}
/**
 * Little-endian version of writableBuffer
 * @remarks You can generate this class yourself with `addDefaultEndianness(writableBuffer, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const writableBufferLE = addDefaultEndianness(writableBuffer, true);

export class writableBufferFixedSize
  extends writableBufferBase<false>
  implements writableBufferStorage
{
  #buffer: Uint8Array;
  #used: number = 0;
  get buffer(): Uint8Array {
    return this.#buffer.subarray(0, this.#used);
  }
  set buffer(value: uint8ArrayLike | writableBufferStorage) {
    if (value.length > this.#buffer.length) {
      throw new Error(
        "Buffer does not have capacity to fit the new buffer's contents"
      );
    }
    // Don't check for writableBufferFixedSize because copying the buffer is what we do anyway and using the same one can result in issues if both instances are used
    if (value instanceof writableBufferBase) {
      // Processing goes into getting this value, so don't grab it twice
      const buffer = value.buffer;
      if (buffer instanceof Uint8Array) {
        this.#buffer.set(buffer, 0);
        this.#used = buffer.length;
        return;
      }
    }
    this.#buffer.set(value as uint8ArrayLike, 0);
    this.#used = (value as uint8ArrayLike).length;
  }
  get length(): number {
    return this.#used;
  }
  get maxLength(): number {
    return this.#buffer.length;
  }
  set maxLength(value: number) {
    if (value < this.#used) {
      throw new Error("Cannot set maxLength to less than used length");
    }
    const oldBuffer = this.buffer;
    this.#buffer = new Uint8Array(value);
    this.#buffer.set(oldBuffer);
  }
  constructor(maxLength: number = 2000) {
    super();
    this.#buffer = new Uint8Array(maxLength);
  }
  /**
   * Reset the buffer
   */
  reset() {
    this.#used = 0;
  }
  push(value: number) {
    if (this.#used === this.#buffer.length) {
      throw new Error("Buffer does not have capacity to write the data");
    }
    this.#buffer[this.#used++] = value;
  }
  writeUint8Array(value: Uint8Array): void {
    if (this.#used + value.length > this.#buffer.length) {
      throw new Error("Buffer does not have capacity to write the data");
    }
    this.#buffer.set(value, this.#used);
    this.#used += value.length;
  }
  writeUint8ArrayBackwards(value: Uint8Array): void {
    // Don't mutate the origional value
    this.writeUint8Array(value.slice(0).reverse());
  }
  writeArray(value: number[]) {
    if (this.#used + value.length > this.#buffer.length) {
      throw new Error("Buffer does not have capacity to write the data");
    }
    this.#buffer.set(value, this.#used);
    this.#used += value.length;
  }
  writeArrayBackwards(value: number[]) {
    // Don't mutate the origional value
    this.writeArray(value.slice(0).reverse());
  }
  writeWriteableBuffer(value: writableBufferStorage) {
    if (value.length > this.#buffer.length - this.#used) {
      throw new Error("Buffer does not have capacity to write the data");
    }
    return this.writeUint8Array(value.buffer);
  }
}
/**
 * Little-endian version of writableBufferFixedSize
 * @remarks You can generate this class yourself with `addDefaultEndianness(writableBufferFixedSize, true)` or make a already created instance little endian via `instance.isLe = true`
 */
export const writableBufferFixedSizeLE = addDefaultEndianness(
  writableBufferFixedSize,
  true
);
