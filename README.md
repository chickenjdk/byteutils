# byteutils

Advanced tools for manipulating binary data in JavaScript

## Supported encodings:

- unsigned integer (bigint and number)
- signed integer (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized function (number[]))
- two's complement (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized function (number[]))
- signed one's complement (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized function (number[]))
- float (number)
- double (number)
- utf8 string
- mutf8 string (java's string encoding)

Functionality that the buffer module simply can't (the buffer module is not used under the hood).
Extendable to interact with your own data pipelines and to easily add your own encodings,
supports async and sync data sources (with the same methods in the same class, so you can async or sync data with the same class extensions, see `Add your own encoding`),
implements reading/writing from streams out of the box, and just plain reading or writing binary data to or from a Uint8Array,
automaticly resizing and fixed length writableBuffer,
and mutch more.
[See docs](https://chickenjdk.github.io/byteutils/docs/v3.4.0)

## Add your own encoding

### Varint

First, find the class you want to extend. For this example, we will be extending readableStream to add minecraft's varint [From here](https://codegolf.stackexchange.com/questions/275210/parse-minecrafts-varint).
This was mainly to show how to add a variable-length encoding.

```javascript
import { readableStream, common } from "@chickenjdk/byteutils";
import { PassThrough } from "stream";
export class readableStreamWithVarint extends readableStream {
  /**
   * Parse a minecraft varint
   * @returns The varint
   */
  readVarint() {
    let result = 0;
    let shift = 0;
    const handleByte = (byte) => {
      // loop over every byte
      result |= (byte & 0x7f) << shift; // add the current 7 bits onto the pre-existing result
      shift += 7;
      if (!(byte & 0x80)) {
        // if the continue bit isn't enabled, break.
        return result;
      } else {
        return common.maybePromiseThen(this.shift(), handleByte);
      }
    };
    return common.maybePromiseThen(this.shift(), handleByte);
  }
}
const PassThroughStream = new PassThrough();
const readableStreamInst = new readableStreamWithVarint(PassThroughStream);
const readPairs = [
  [1, [0x1]],
  [25565, [0xdd, 0xc7, 0x01]],
  [1113983, [0xff, 0xfe, 0x43]],
  [-1113983, [0x81,0x81,0xbc,0xff,0xf]],
  [-25565, [0xa3,0xb8,0xfe,0xff,0xf]],
  [-1, [0xff, 0xff, 0xff, 0xff, 0x0f]],
];
(async () => {
  for (const [expected] of readPairs) {
    console.log(
      `Read varint (expected ${expected}): ${await readableStreamInst.readVarint()}`
    );
  }
})();
// 2,147,483,648
for (const [, bytes] of readPairs) {
  PassThroughStream.write(new Uint8Array(bytes));
  await new Promise((resolve) => setTimeout(resolve, 500));
}

```

### Make a Transform stream to convert varints to 32 bit two's complements and re-parse them

```javascript
import {
  simplestreams,
  writableBufferFixedSize,
} from "@chickenjdk/byteutils";

// Copy + pasted from a random code golf
const encode = (n) => (n >> 7 ? [(n & 127) | 128, ...encode(n >>> 7)] : [n]);

const writableTranslationInst = new writableBufferFixedSize(4);

class ReadableStreamWithVarint extends simplestreams.transform.Transform {
  async pull() {
    let result = 0;
    let shift = 0;
    let done = false;

    while (!done) {
      const byte = await this.source.shift();
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if (!(byte & 0x80)) done = true;
    }

    writableTranslationInst.writeTwosComplement(result, 4);
    const data = writableTranslationInst.buffer;
    writableTranslationInst.reset();
    return data;
  }
}

// Generate data
const numberOfVarints = 500000;

// Generate varints, both positive and negative
const readPairs = Array.from({ length: numberOfVarints }, (_, i) => {
  const value = i % 2 === 0 ? i : -i;
  return [value, encode(value)];
});

console.log(readPairs);
// Actually do it
const source = new simplestreams.pushable.PushableStream(true);
const transform = new ReadableStreamWithVarint(source, true);
const handle = new simplestreams.handles.StreamHandle(transform, true);

for (const [, bytes] of readPairs) {
  await source.source.writeArray(bytes);
}

for (const [expected] of readPairs) {
  const got = await handle.readTwosComplement(4);
  if (got !== expected) {
    throw new Error(`Value mismatch, expected ${expected} but got ${got}`)
  }
}
```
