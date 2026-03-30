export type byteLike = number;
export type bytesLike = Uint8Array | ArrayLike<number> | TypedArrayView;

export interface WritableArrayLike<T> {
  length: number;
  [n: number]: T;
}

export function sortArray(
  array: WritableArrayLike<number>,
  indexStart: number,
  indexEnd: number,
  compareFunction: (a: number, b: number) => number,
) {
  if (indexStart >= indexEnd) return;

  const middle = array[(indexStart + indexEnd) >> 1];
  let startingIndex = indexStart;
  let endingIndex = indexEnd;

  while (startingIndex <= endingIndex) {
    while (compareFunction(array[startingIndex], middle) < 0) startingIndex++;
    while (compareFunction(array[endingIndex], middle) > 0) endingIndex--;

    if (startingIndex <= endingIndex) {
      const item = array[startingIndex];
      array[startingIndex] = array[endingIndex];
      array[endingIndex] = item;
      startingIndex++;
      endingIndex--;
    }
  }

  if (indexStart < endingIndex)
    sortArray(array, indexStart, endingIndex, compareFunction);
  if (startingIndex < indexEnd)
    sortArray(array, startingIndex, indexEnd, compareFunction);
}

export abstract class TypedArrayMemoryBackend {
  abstract get(start: number, end: number): Uint8Array;

  abstract read(index: number): number;

  abstract set(value: byteLike | bytesLike, start: number): void;
}

export class Uint8ArrayMemoryBackend implements TypedArrayMemoryBackend {
  data: Uint8Array;
  /**
   * A dummy memory backend for TypedArrayView.
   * No real big use of this, but I included it anyway.
   * @param size
   */
  constructor(size: number) {
    this.data = new Uint8Array(size);
  }

  get(start: number, end: number) {
    return this.data.slice(start, end);
  }

  read(index: number) {
    return this.data[index];
  }

  set(value: byteLike | bytesLike, start: number) {
    if (typeof value === "number") {
      this.data[start] = value & 0xff;
      return;
    }

    const src = value instanceof Uint8Array ? value : Uint8Array.from(value);
    this.data.set(src, start);
  }
}

export class TypedArrayView implements Uint8Array {
  readonly length: number;
  readonly backend: TypedArrayMemoryBackend;
  readonly byteOffset: number;
  readonly BYTES_PER_ELEMENT: number;
  get byteLength() {
    return this.length * this.BYTES_PER_ELEMENT;
  }
  /**
   * A view on dynamically allocated memory.
   * DISCLAIMER: THIS DOES NOT SAVE YOU MEMORY, THE OS DOES THIS
   * However, this can tell you which chunks are allocated if your backend allows it, unlike the javascript engine.
   * @param length The virtual length of the typed array
   * @param backend The memory backend of your choosing to view
   * @param byteOffset The offset from the start of the memory backend in which to start the array. This is the bytes offset, NOT the element length offset.
   * @param bytesPerElement How many bytes are in an element. IMPLEMENTERS: fill out this parameter in your super call
   * @returns
   */
  constructor(
    length: number,
    backend: TypedArrayMemoryBackend,
    byteOffset = 0,
    bytesPerElement = 1,
  ) {
    this.length = length;
    this.backend = backend;
    this.byteOffset = byteOffset;
    this.BYTES_PER_ELEMENT = bytesPerElement;

    return new Proxy(this, {
      get(target, prop) {
        if (!isNaN(prop as unknown as number)) {
          const i = Number(prop);
          if (i < 0 || i >= target.length) return undefined;
          return target._read(i);
        }

        return target[prop as keyof typeof target];
      },

      set(target, prop, value) {
        if (!isNaN(prop as unknown as number)) {
          const i = Number(prop);
          if (i < 0 || i >= target.length) return false;
          target._write(i, value);
          return true;
        }

        target[prop as keyof typeof target] = value;
        return true;
      },
    });
  }

  /**
   * Generate a byte index into the buffer for an entry
   * @param i The index
   * @returns The starting index into the buffer
   */
  private _byteIndex(i: number) {
    return this.byteOffset + i * this.BYTES_PER_ELEMENT;
  }

  /**
   * Read a number at an index.
   * Can be overridden to store data in different number formats
   * @private
   * @param i The index of the data
   * @returns The number
   */
  _read(i: number) {
    return this.backend.read(this._byteIndex(i));
  }

  /**
   * Write a number at an index.
   * Can be overridden to store data in different number formats
   * @private
   * @param i The index of the data
   * @param value The value of the number
   */
  _write(i: number, value: byteLike) {
    this.backend.set(value, this._byteIndex(i));
  }

  // No JSDOC comments because they should be inherited from Uint8Array

  set(source: bytesLike, offset = 0) {
    if (offset < 0 || offset >= this.length)
      throw new RangeError("Offset out of bounds");

    let src;

    if (source instanceof TypedArrayView) {
      src = source.backend.get(
        source.byteOffset,
        source.byteOffset + source.length * source.BYTES_PER_ELEMENT,
      );
    } else if (source instanceof Uint8Array) {
      src = source;
    } else {
      src = Uint8Array.from(source);
    }

    const start = this._byteIndex(offset);

    if (
      start + src.length >
      this.byteOffset + this.length * this.BYTES_PER_ELEMENT
    )
      throw new RangeError("Source too large");

    this.backend.set(src, start);
  }

  // Slice/view methods
  subarray(
    begin: number | undefined = 0,
    end: number | undefined = this.length,
  ) {
    if (begin < 0) begin += this.length;
    if (end < 0) end += this.length;

    begin = Math.max(0, begin);
    end = Math.min(this.length, end);

    const newLen = Math.max(end - begin, 0);

    return new (this.constructor as typeof TypedArrayView)(
      newLen,
      this.backend,
      this._byteIndex(begin),
    );
  }

  slice(begin = 0, end = this.length) {
    const view = this.subarray(begin, end);

    const bytes = this.backend.get(
      view.byteOffset,
      view.byteOffset + view.length * view.BYTES_PER_ELEMENT,
    );

    const backend = new (this.backend
      .constructor as typeof Uint8ArrayMemoryBackend)(bytes.length);
    backend.set(bytes, 0);

    return new (this.constructor as typeof TypedArrayView)(
      view.length,
      backend,
      0,
    );
  }

  // Copying/writing methods
  fill(value: number, start = 0, end = this.length) {
    const count = Math.max(end - start, 0);
    const arr = new Uint8Array(count).fill(value & 0xff);

    this.backend.set(arr, this._byteIndex(start));

    return this;
  }

  copyWithin(target: number, start = 0, end = this.length) {
    const src = this.subarray(start, end);

    const bytes = this.backend.get(
      src.byteOffset,
      src.byteOffset + src.length * src.BYTES_PER_ELEMENT,
    );

    this.backend.set(bytes, this._byteIndex(target));

    return this;
  }

  reverse(): this {
    // The math.floor is so this will skip the "middle" index if this array's length is odd
    for (let indexA = 0; indexA < Math.floor(this.length / 2); indexA++) {
      const indexB = this.length - indexA;

      const itemA = this[indexA];
      const itemB = this[indexB];
      this[indexA] = itemB;
      this[indexB] = itemA;
    }

    return this;
  }

  toReversed() {
    return this.slice().reverse();
  }
  toSorted(compareFn?: ((a: number, b: number) => number) | undefined) {
    return this.slice().sort(compareFn);
  }
  with(index: number, value: number) {
    const copy = this.slice();
    copy[index] = value;
    return copy;
  }

  // Iterator methods
  map(
    callbackfn: (value: number, index: number, array: this) => number,
    thisArg?: any,
  ) {
    // Allocate a new buffer
    const backend = new (this.backend
      .constructor as typeof Uint8ArrayMemoryBackend)(this.length);
    const items = new (this.constructor as typeof TypedArrayView)(
      this.length,
      backend,
    );
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      items[index] = callbackfn.call(thisArg, item, index, this);
    }
    return items;
  }
  reduce<U, I>(
    callbackfn: (
      previousValue: U | I,
      currentValue: number,
      currentIndex: number,
      array: this,
    ) => U,
    initialValue: I = undefined as I,
  ): U | I {
    let previousValue: U | I = initialValue;
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      previousValue = callbackfn(previousValue, item, index, this);
    }
    return previousValue;
  }
  reduceRight<U, I>(
    callbackfn: (
      previousValue: U | I,
      currentValue: number,
      currentIndex: number,
      array: this,
    ) => U,
    initialValue: I = undefined as I,
  ): U | I {
    let previousValue: U | I = initialValue;
    for (let index = this.length - 1; index >= 0; index--) {
      const item = this[index];
      previousValue = callbackfn(previousValue, item, index, this);
    }
    return previousValue;
  }
  sort(compareFn: (a: number, b: number) => number = (a, b) => a - b): this {
    sortArray(this, 0, this.length - 1, (a, b) => {
      const result = Number(compareFn(a, b));
      if (Number.isNaN(result)) {
        return 0;
      }
      return result;
    });
    return this;
  }
  includes(searchElement: number, fromIndex?: number): boolean {
    return this.indexOf(searchElement, fromIndex) !== -1;
  }
  at(index: number): number | undefined {
    return this[index];
  }
  findLast(
    predicate: (value: number, index: number, array: this) => boolean,
    thisArg?: any,
  ): number | undefined {
    const index = this.findLastIndex(predicate, thisArg);
    if (index === -1) {
      return undefined;
    } else {
      // Typescript, why...
      // @ts-ignore
      return this[index];
    }
  }
  findLastIndex(
    predicate: (value: number, index: number, array: this) => unknown,
    thisArg?: any,
  ): number {
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      // I have to do this mess or else typescript explodes
      if (Boolean(predicate.call(thisArg, item, index, this))) {
        return index;
      }
    }
    return -1;
  }
  // Iterator filtering methods
  // Iterator filtering methods with callbacks
  every(
    predicate: (value: number, index: number, array: this) => unknown,
    thisArg?: any,
  ): boolean {
    for (let index = 0; index < this.length; index++) {
      const result = predicate.call(thisArg, this[index], index, this);
      if (Boolean(result) === false) {
        return false;
      }
    }
    return true;
  }

  some(
    predicate: (value: number, index: number, array: this) => unknown,
    thisArg?: any,
  ): boolean {
    for (let index = 0; index < this.length; index++) {
      const result = predicate.call(thisArg, this[index], index, this);
      if (Boolean(result) === true) {
        return true;
      }
    }
    return false;
  }

  find(
    predicate: (value: number, index: number, obj: this) => boolean,
    thisArg?: any,
  ): number | undefined {
    const index = this.findIndex(predicate, thisArg);
    if (index === -1) {
      return undefined;
    } else {
      return index;
    }
  }

  findIndex(
    predicate: (value: number, index: number, obj: this) => boolean,
    thisArg?: any,
  ): number {
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      const result = predicate.call(thisArg, item, index, this);
      if (Boolean(result) === true) {
        return index;
      }
    }
    return -1;
  }

  filter(
    predicate: (value: number, index: number, array: this) => any,
    thisArg?: any,
  ) {
    // Allocate a new buffer
    const backend = new (this.backend
      .constructor as typeof Uint8ArrayMemoryBackend)(this.length);
    const items = new (this.constructor as typeof TypedArrayView)(
      this.length,
      backend,
    );
    let outputIndex = 0;
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      const result = predicate.call(thisArg, item, index, this);
      if (Boolean(result)) {
        items[outputIndex++] = item;
      }
    }
    // Output index is exclusive, so this works
    return items.subarray(0, outputIndex);
  }
  // Iterator filtering methods without callbacks
  indexOf(searchElement: number, fromIndex: number = 0): number {
    for (let index = fromIndex; index < this.length; index++) {
      const item = this[index];
      if (item === searchElement) {
        return index;
      }
    }
    return -1;
  }

  lastIndexOf(
    searchElement: number,
    fromIndex: number = this.length - 1,
  ): number {
    fromIndex = Math.max(this.length - 1, fromIndex);
    for (let index = fromIndex; index >= 0; index--) {
      const item = this[index];
      if (item === searchElement) {
        return index;
      }
    }
    return -1;
  }
  // Plain iterators
  forEach(
    callbackfn: (value: number, index: number, array: this) => void,
    thisArg?: any,
  ): void {
    for (let index = 0; index < this.length; index++) {
      const item = this[index];
      callbackfn.call(thisArg, item, index, this);
    }
  }

  join(separator: string = ""): string {
    let result = "";
    for (const item of this) {
      result += item + separator;
    }
    return separator.length > 0 ? result.slice(0, -separator.length) : result;
  }

  *values(): ArrayIterator<number> {
    for (let i = 0; i < this.length; i++) yield this[i];
  }

  *keys(): ArrayIterator<number> {
    for (let i = 0; i < this.length; i++) yield i;
  }

  *entries(): ArrayIterator<[number, number]> {
    for (let i = 0; i < this.length; i++) yield [i, this[i]];
  }

  [Symbol.iterator]() {
    return this.values();
  }
  // Hacks
  buffer: any;
  valueOf(): any {}
  [Symbol.toStringTag] = "TypedArrayView" as any;
  // Index signature for the proxy
  [key: number]: number;
}

export class DynamicUint8Array extends TypedArrayView {
  constructor(
    length: number,
    backend: TypedArrayMemoryBackend,
    byteOffset = 0,
  ) {
    super(length, backend, byteOffset, 1);
  }
}
