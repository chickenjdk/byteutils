import { joinUint8Arrays } from "./common.js";
import { TypedArrayMemoryBackend } from "./dynamicTypedArrays.js";

// startIndex: inclusive, endIndex: exclusive
type bufferStorage = {
  data: Uint8Array;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
};
export abstract class ResizableBufferBase implements TypedArrayMemoryBackend {
  #buffers: bufferStorage[];
  #allocated: number = 0;
  abstract supportsDynamicChunkSize: boolean;
  /**
   * @private
   * For use by extending classes only.
   * TODO: stop over-using getters
   */
  get _buffers() {
    return this.#buffers;
  }
  get allocatedLength() {
    return this.#allocated;
  }
  readonly length: number = Infinity;
  #chunkSize: number;
  get chunkSize() {
    return this.#chunkSize;
  }
  set chunkSize(size: number) {
    if (this.supportsDynamicChunkSize) {
      this.#chunkSize = size;
    } else {
      throw new Error("This class does not support a dynamic chunk size");
    }
  }
  /**
   * Create a dynamically allocated data buffer
   * @param chunkSize The size of the chunks that we allocate
   */
  constructor(chunkSize: number = 2000) {
    this.#buffers = [];
    this.#chunkSize = chunkSize;
  }
  /**
   * Manually add a buffer. In some subclasses this could break things!
   * @private
   * @param data The data to add
   */
  _addBuffer(data: Uint8Array) {
    const lastBuffer = this.#currentBuffer();
    const bufferLength = data.length;

    this.#allocated += bufferLength;

    this.#buffers.push({
      data: data,
      startIndex: lastBuffer.endIndex,
      endIndex: lastBuffer.endIndex + bufferLength,
      // This is correct because the length is currently the length after operation - 1, and the index is length after operation - 1
      chunkIndex: this.#buffers.length,
    });
  }
  #alloc() {
    const newBuffer = new Uint8Array(this.#chunkSize);
    this._addBuffer(newBuffer);
  }
  #currentBuffer() {
    return (
      this.#buffers[this.#buffers.length - 1] ?? {
        startIndex: 0,
        endIndex: 0,
        data: undefined,
      }
    );
  }
  /**
   * Convert a global index into a buffer to a index into the buffer
   * @param buffer The buffer we are referencing
   * @param globalIndexToBuffer The global index that we are converting
   * @returns The index into the buffer's data this represents
   */
  #globalToLocal(buffer: bufferStorage, globalIndexToBuffer: number): number {
    const location = globalIndexToBuffer - buffer.startIndex;
    if (location < 0 || globalIndexToBuffer > buffer.endIndex) {
      throw new Error("Local index out of bounds");
    }
    return location;
  }
  /**
   * Find the index of a chunk for a byte index
   * @private
   * @param index The index of the data
   * @returns The index of the chunk
   */
  abstract _getBufferPosition(index: number): number;
  /**
   * A listener for changes in chunks.
   * @param chunkIndexes The indexes of the changed chunks.
   */
  _handleChange(chunkIndexes: number[]): void {}
  /**
   * Transform our buffers, making it look like our data fits perfectly and starts at 0 in the buffers.
   * @param indexStart The start index.
   * @param indexEnd The end index.
   * @returns The transformed buffers
   */
  #localizeBuffers(indexStart: number, indexEnd: number) {
    // +1 to make it inclusive
    const usingBuffers = this.#buffers.slice(
      this._getBufferPosition(indexStart),
      this._getBufferPosition(indexEnd) + 1,
    );

    // Transform the buffers to look like indexStart to indexEnd is all we are storing (by rewriting the indexes and subarraying)
    const usingBuffersTransformed: bufferStorage[] = [];
    for (const buffer of usingBuffers) {
      let startSlice = 0;

      try {
        startSlice = this.#globalToLocal(buffer, indexStart);
      } catch {
        // If out of bounds, just go with 0
      }

      let endSlice = undefined;
      try {
        endSlice = this.#globalToLocal(buffer, indexEnd);
      } catch {
        // If out of bounds, just go with the end, undefined
      }
      usingBuffersTransformed.push({
        data: buffer.data.subarray(startSlice, endSlice),
        startIndex: buffer.startIndex + startSlice - indexStart,
        endIndex:
          buffer.endIndex -
          (buffer.data.length - (endSlice ?? buffer.data.length)) -
          indexStart,
        chunkIndex: usingBuffersTransformed.length,
      });
    }
    return usingBuffersTransformed;
  }

  /**
   * Set byte(s) in a position in the buffer
   * @param value The byte(s)
   * @param indexStart The starting index, or if you only provide one byte, the index, of where the data should go
   */
  set(value: Uint8Array | ArrayLike<number> | number, indexStart: number) {
    if (typeof value === "number") {
      while (indexStart >= this.#currentBuffer().endIndex) {
        this.#alloc();
      }
      const inBuffer = this.#buffers[this._getBufferPosition(indexStart)];
      inBuffer.data[this.#globalToLocal(inBuffer, indexStart)] = value;
      this._handleChange([inBuffer.chunkIndex]);
    } else {
      const indexEnd = indexStart + value.length;
      while (indexEnd >= this.#currentBuffer().endIndex) {
        this.#alloc();
      }

      const usingBuffersTransformed = this.#localizeBuffers(
        indexStart,
        indexEnd,
      );

      for (const buffer of usingBuffersTransformed) {
        buffer.data.set(
          value instanceof Uint8Array
            ? value.subarray(buffer.startIndex, buffer.endIndex)
            : Array.prototype.slice.call(
                value,
                buffer.startIndex,
                buffer.endIndex,
              ),
        );
      }
      this._handleChange(
        // Remap to the absolute buffer indexes
        usingBuffersTransformed.map(
          ({ chunkIndex }) => indexStart + chunkIndex,
        ),
      );
    }
  }

  /**
   * Get a copy of the data in the buffer between two indexes. (same behavior as .slice in a Uint8Array)
   */
  get(indexStart: number, indexEnd: number) {
    const length = indexEnd - indexStart;

    return joinUint8Arrays(this.getBuffers(indexStart, indexEnd), length);
  }

  /**
   * Read a byte at an index
   * @param index The index
   * @returns The byte
   */
  read(index: number) {
    if (index > this.#allocated - 1) {
      return 0;
    } else {
      const chunkIndex = this._getBufferPosition(index);
      const buffer = this.#buffers[chunkIndex];
      return buffer.data[this.#globalToLocal(buffer, index)];
    }
  }

  /**
   * Get an array of subarrays of the internal buffers! (WARNING: mutations will edit the data in this instance)
   * Like .get, but does not join the chunks.
   * Also does not give you more data than we really have, making the "infinite length buffer" abstraction leaky but allocatedLength does that too.
   * @param indexStart The starting index
   * @param indexEnd The ending index
   * @returns Your buffers, fresh off .subarray
   */
  getBuffers(indexStart: number, indexEnd: number) {
    if (indexEnd > this.#allocated - 1) {
      indexEnd = this.#allocated - 1;
    }

    const usingBuffersTransformed = this.#localizeBuffers(indexStart, indexEnd);

    return usingBuffersTransformed.map(({ data }) => data);
  }
}

export class ShardBuffer extends ResizableBufferBase {
  readonly supportsDynamicChunkSize: boolean = true;
  /**
   * Take a bunch of individual Uint8Arrays and read/edit them as a single whole buffer.
   * Also allocated new Uint8Arrays if you go out of the bounds of the ones you pass.
   * This is meant as temporary! This is slow for long-term use!
   */
  constructor(buffers: Uint8Array[], newAllocatedChunkSize: number = 2000) {
    super(newAllocatedChunkSize);
    for (const buffer of buffers) {
      this._addBuffer(buffer);
    }
  }
  _getBufferPosition(index: number) {
    // Lowest possible index
    let low = 0;
    // Highest possible index
    let high = this._buffers.length - 1;

    // Keep going until it becomes invalid
    while (low <= high) {
      // The middle of the search range
      const mid = (low + high) >> 1;
      // Grab the buffer in the middle
      const buf = this._buffers[mid];

      // It will be in the lower half because the start is above what we want
      if (index < buf.startIndex) {
        high = mid - 1;
        //  It will be in the upper half because the index is above the end of the middle
      } else if (index >= buf.endIndex) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    throw new Error("Index out of range");
  }
}

export class DynamicBuffer extends ResizableBufferBase {
  readonly supportsDynamicChunkSize: boolean = false;
  /**
   * A data buffer that dynamically allocates the space for its contents.
   * @param chunkSize The size of the chunks that we allocate
   */
  constructor(chunkSize: number = 2000) {
    super(chunkSize);
  }
  _getBufferPosition(index: number): number {
    return Math.floor(index / this.chunkSize);
  }
}
