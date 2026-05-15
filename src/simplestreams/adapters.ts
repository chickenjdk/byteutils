import { Readable } from "stream";
import { PushableStreamBase } from "./pushable.js";
import { BaseStream, baseStreamEvents } from "./base.js";
import {
  knownPromiseThen,
  maybePromiseResolve,
  noDataUint8Array,
  SimpleEventEmitter,
} from "../common.js";
import { MaybePromise } from "../types.js";

export class NodejsStreamIAdapter extends PushableStreamBase<true, Readable> {
  readonly isAsync: true = true;
  readonly source: Readable;
  readonly events: SimpleEventEmitter<baseStreamEvents>;
  highWaterMark: number;
  lowWaterMark: number;

  constructor(
    source: Readable,
    chunkSize: number = 2000,
    {
      highWaterMark = 8000,
      lowWaterMark = 3000,
    }: Partial<{ highWaterMark: number; lowWaterMark: number }> = {},
  ) {
    super(true, chunkSize);
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
    this.source = source;
    this.events = new SimpleEventEmitter();
    this.source.on("data", (data) => {
      this._writeUint8Array(data);
      if (this.bufferedLen > highWaterMark) {
        this.source.pause();
      }
    });
  }
  _pull(ideal: number): Promise<Uint8Array<ArrayBufferLike>> {
    if (this.lowWaterMark > this.bufferedLen) {
      this.source.resume();
    }
    return super._pull(ideal);
  }
}

export class NodejsStreamOAdapter<IsAsync extends boolean> extends Readable {
  readonly source: BaseStream<IsAsync>;
  #wait: MaybePromise<void, IsAsync> | undefined;
  constructor(source: BaseStream<IsAsync>) {
    super();
    this.source = source;
    source.events.once("close", async () => {
      await this.#wait;
      this.push(null);
    });
  }
  _read(size: number): void {
    this.#wait = knownPromiseThen(
      this.source.pull(size),
      (chunk) => {
        this.push(chunk);
      },
      this.source.isAsync,
    );
  }
}

export class WhatwgStreamIAdapter extends BaseStream<true> {
  readonly isAsync: true = true;
  readonly source: ReadableStream;
  readonly events: SimpleEventEmitter<baseStreamEvents>;
  reader: ReadableStreamDefaultReader;

  constructor(source: ReadableStream) {
    super();
    this.source = source;
    this.reader = this.source.getReader();
    this.events = new SimpleEventEmitter();
  }

  async _pull(ideal: number): Promise<Uint8Array<ArrayBufferLike>> {
    const result = await this.reader.read();
    if (result.done) {
      this.close();
    }
    if (result.value === undefined) {
      return noDataUint8Array;
    } else {
      return result.value;
    }
  }
  close() {
    super.close();
    this.reader.releaseLock();
  }
}

export function WhatwgStreamOAdapter(
  source: BaseStream<true>,
  chunkSize: number = 2000,
) {
  return new ReadableStream({
    async pull(controller) {
      if (source.closed) {
        controller.close();
      } else {
        const chunk = await source.pull(chunkSize);
        controller.enqueue(chunk);
      }
    },
  });
}
