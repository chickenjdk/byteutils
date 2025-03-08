// Buffers for converting numbers!
export const float32Array = new Float32Array(1);
export const uint8Float32ArrayView = new Uint8Array(float32Array.buffer);
export const float64Array = new Float64Array(1);
export const uint8Float64ArrayView = new Uint8Array(float64Array.buffer);
float32Array[0] = 2;
export const isBigEndian = uint8Float32ArrayView[0] === 64;
// Common helpers
/**
 * Extend the provided readable/writable buffer to set a default endianness
 * @param buffer The buffer to extend
 * @param isLe If to make the default endianness Little Endian
 */
export function addDefaultEndianness<
  T extends {
    prototype: {
      isLe: boolean;
    };
    new (...args: any[]): any; // Constructor signature
  }
>(buffer: T, isLe: boolean) {
  return class extends buffer {
    constructor(...args: any[]) {
      // @ts-ignore
      super(...args);
      this.isLe = isLe;
    }
  };
}
