const test = require("node:test");
const byteutils = require("..");
const assert = require("node:assert");

const stream = require("node:stream");

const testCaseRawArray = Array(256)
  .fill(null)
  .map((_, i) => i);
const testCaseRawUint8Array = new Uint8Array(testCaseRawArray);

/**
 * @param {test.TestContext} t
 * @param {() => byteutils.writableBufferBase} instantiateBuffer
 */
const writableBufferTestSuite = (t, instantiateBuffer) => {
  // We await because it can not hurt anything, but of course it may be a better idea to only await if the buffer should return a promise, and if it returns a promise when it should not, we throw. Wait until we fix async handling to make this change.
  const mutationTest = (forwards) =>
    t.test(
      `Writing ${forwards ? "forwards" : "backwards"} does not mutate the original value for type ` +
        t.name,
      (t) => {
        t.test(t.name + " for Uint8Arrays", async () => {
          const instance = instantiateBuffer();
          const buffer = testCaseRawUint8Array.slice();
          if (forwards) {
            await instance.writeUint8Array(buffer);
          } else {
            await instance.writeUint8ArrayBackwards(buffer);
          }

          assert.deepStrictEqual(
            buffer,
            testCaseRawUint8Array,
            "The source buffer was mutated",
          );
        });
        t.test(t.name + " for arrays", async () => {
          const instance = instantiateBuffer();
          const buffer = testCaseRawArray.slice();
          if (forwards) {
            await instance.writeArray(buffer);
          } else {
            await instance.writeArrayBackwards(buffer);
          }
          assert.deepStrictEqual(
            buffer,
            testCaseRawArray,
            "The source buffer was mutated",
          );
        });
      },
    );
  mutationTest(true);
  mutationTest(false);
};
test("Writable", { timeout: 1000 }, (t) => {
  t.test("Resizing", (t) => {
    function chunkTests(chunkSize, name) {
      t.test("Can write values " + name, (t) => {
        t.test("Can write a Uint8Array " + name, (t) => {
          t.test(t.name + " forwards", () => {
            const writableBufferInstance = new byteutils.writableBuffer(
              chunkSize,
            );
            writableBufferInstance.writeUint8Array(testCaseRawUint8Array);
            assert.deepStrictEqual(
              writableBufferInstance.buffer,
              testCaseRawUint8Array,
            );
          });
          t.test(t.name + " backwards", () => {
            const writableBufferInstance = new byteutils.writableBuffer(
              chunkSize,
            );
            writableBufferInstance.writeUint8ArrayBackwards(
              testCaseRawUint8Array,
            );
            assert.deepStrictEqual(
              writableBufferInstance.buffer.reverse(),
              testCaseRawUint8Array,
            );
          });
        });
        t.test("Can write an array " + name, (t) => {
          t.test(t.name + " forwards", () => {
            const writableBufferInstance = new byteutils.writableBuffer(
              chunkSize,
            );
            writableBufferInstance.writeArray(testCaseRawArray);
            assert.deepStrictEqual(
              writableBufferInstance.buffer,
              testCaseRawUint8Array,
            );
          });
          t.test(t.name + " backwards", () => {
            const writableBufferInstance = new byteutils.writableBuffer(
              chunkSize,
            );
            writableBufferInstance.writeArrayBackwards(testCaseRawArray);
            assert.deepStrictEqual(
              writableBufferInstance.buffer.reverse(),
              testCaseRawUint8Array,
            );
          });
        });
      });
    }
    chunkTests(256 / 0.5, "Spanning half of a chunk");
    chunkTests(256 / 4, "Spanning 4 chunks");
    chunkTests(256 / 6.4, "Spanning 6.4 chunks");
  });
});

test("Streams", (t) => {
  t.test("Readable node.js stream wrappers", (t) => {
    t.test("Reads are in order", (t) => {
      const sourceStream = new stream.PassThrough();

      const readableStream = new byteutils.readableStream(sourceStream);
      const task = (() => {
        return Promise.all(
          [
            async () =>
              assert.deepStrictEqual(
                await readableStream.readUint8Array(
                  testCaseRawUint8Array.length,
                ),
                testCaseRawUint8Array,
              ),
            async () =>
              assert.deepStrictEqual(
                await readableStream.readUint8Array(
                  testCaseRawUint8Array.length,
                ),
                testCaseRawUint8Array.slice().reverse(),
              ),
          ].map((v) => v()),
        );
      })();
      sourceStream.write(testCaseRawUint8Array);
      sourceStream.write(testCaseRawUint8Array.slice().reverse());

      return task;
    });
    t.test(
      "Throws when the stream ends during a read that has acquired the lock and there is not enough data left",
      (t) => {
        const sourceStream = new stream.PassThrough();

        const readableStream = new byteutils.readableStream(sourceStream);
        const task = (async () => {
          await assert.rejects(readableStream.read(10));
        })();
        sourceStream.destroy();

        return task;
      },
    );
    t.test("Throws when the stream ends but with partial data", (t) => {
      const sourceStream = new stream.PassThrough();

      const readableStream = new byteutils.readableStream(sourceStream);
      const task = (async () => {
        await assert.rejects(readableStream.read(10));
      })();
      sourceStream.write(new Uint8Array([1, 2, 3, 4, 5]));
      sourceStream.destroy();

      return task;
    });
    t.test(
      "Throws when the stream ends with enough data for the first but not the second pending read",
      (t) => {
        const sourceStream = new stream.PassThrough();

        const readableStream = new byteutils.readableStream(sourceStream);
        const task = (async () => {
          await assert.rejects(readableStream.read(10));
        })();
        sourceStream.destroy();

        return task;
      },
    );
    t.test("Works when the stream ends but full data", (t) => {
      const sourceStream = new stream.PassThrough();

      const readableStream = new byteutils.readableStream(sourceStream);
      const task = (async () => {
        assert.deepStrictEqual(
          await readableStream.read(testCaseRawUint8Array.length),
          testCaseRawUint8Array,
        );
      })();
      sourceStream.write(testCaseRawUint8Array);
      sourceStream.destroy();

      return task;
    });
    // TODO (coolchickenguy): Test drain events and related properties
  });
  t.test("Writable node.js stream wrappers", (t) => {
    writableBufferTestSuite(t, () => {
      // Dummy stream
      const outputStream = new stream.PassThrough();
      const inst = new byteutils.writableStream(outputStream);
      outputStream.on("data", () => {});
      return inst;
    });
  });
});
