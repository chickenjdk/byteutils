# byteutils

Some basic tools for working with big and little endian binary data.

## Supported encodings:

- unsigned integer (bigint and number)
- signed integer (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized funtion (number[]))
- two's complement (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized funtion (number[]))
- signed one's complement (bigint, number, and one-byte-long optimized function (number), and one-byte-long-for-each-element-array optimized funtion (number[]))
- float (number)
- double (number)
- utf8 string
- mutf8 string (java's string encoding)

Functionality that the buffer module simply can't (the buffer module is not used under the hood).
Extendable to interact with your own data pipelines and to easaly add your own encodings,
supports async and sync data sources (with the same methods in the same class, so you can async or sync data with the same class extentions, see `Add your own encoding`),
implements reading/writing from streams out of the box, and just plain reading or writing binary data to or from a Uint8Array,
automaticly resizing and fixed length writableBuffer,
and mutch more.
[See docs](https://chickenjdk.github.io/byteutils/docs/3.1.2)

## Add your own encoding

### Varint

First, find the class you want to extend. For this exsample, we will be extending readableStream to add minecraft's varint [From here](https://codegolf.stackexchange.com/questions/275210/parse-minecrafts-varint).
This was mainly to show how to add a varible-length encoding. We also have a delay between writed to show how this library can handle waiting for data from streams

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

### Make a Tranform stream to convert varints to 32 bit two's complements (That is what most programs convert them to internaly)

```javascript
import {
  readableStream,
  writableStream,
  common,
  writableBufferFixedSize,
} from "@chickenjdk/byteutils";
import { Transform, PassThrough, Readable, Duplex } from "stream";
import { pipeline } from "stream/promises";
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
function buildTransform() {
  const PassThroughInst = new PassThrough();
  const readableInst = new readableStreamWithVarint(PassThroughInst);
  const writableTranslationInst = new writableBufferFixedSize(4);
  let waitingChunks = [];
  let handler = handleVarint();
  const TransformStream = new Transform({
    async transform(chunk, encoding, callback) {
      PassThroughInst.write(chunk);
      await new Promise((resolve) => readableInst.onceDrain(resolve));
      // This is safe because flush->all data read but not returned yet->handler done (we are awaiting the current value, which has not gotten to the data yet, so we won't be stuck waiting forever because it restarted itself)
      await handler;
      const data = common.joinUint8Arrays(waitingChunks);
      waitingChunks = [];
      callback(null, data);
    },
  });
  async function handleVarint() {
    writableTranslationInst.reset();
    const int = await readableInst.readVarint();
    writableTranslationInst.writeTwosComplement(int, 4);
    // Copying the buffer is important, not doing so will result in the last number over and over because it it later overrwritten
    waitingChunks.push(writableTranslationInst.buffer.slice(0));
    if (!TransformStream.closed) {
      handler = handleVarint();
    }
  }

  return TransformStream;
}
const readPairs = [
  [1, [0x1]],
  [25565, [0xdd, 0xc7, 0x01]],
  [1113983, [0xff, 0xfe, 0x43]],
  [-1113983, [0x81,0x81,0xbc,0xff,0xf]],
  [-25565, [0xa3,0xb8,0xfe,0xff,0xf]],
  [-1, [0xff, 0xff, 0xff, 0xff, 0x0f]],
];
const loggerStream = new PassThrough();
const loggerReadableStreamInst = new readableStream(loggerStream);
(async () => {
  let i = 0;
  while (!loggerStream.closed) {
    // Don't worry about Stream ended before listener could be satisfied errors in this configuration
    // You could check if the error is that, but this is just an exsample
    try {
      console.log(
        `Read ${await loggerReadableStreamInst.readTwosComplement(
          4
        )} Expected ${readPairs[i++][0]}`
      );
    } catch (e) {}
  }
})();
await pipeline(
  Readable.from(readPairs.map(([, data]) => new Uint8Array(data))),
  buildTransform(),
  loggerStream
);

```
