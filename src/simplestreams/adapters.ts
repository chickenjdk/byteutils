import { Readable } from "stream";
import { PushableStreamBase } from "./pushable.js";
import { BaseStream } from "./base.js";

export class NodejsStreamIAdapter extends PushableStreamBase<true, Readable> {
  isAsync: true = true;
  readonly source: Readable;
  highWaterMark: number;
  lowWaterMark: number;

  constructor(
    source: Readable,
    chunkSize: number = 2000,
    {
      highWaterMark = 8000,
      lowWaterMark = 3000,
    }: { highWaterMark: number; lowWaterMark: number },
  ) {
    super(true, chunkSize);
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
    this.source = source;
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
    return super.pull(ideal);
  }
}

export class NodejsStreamOAdapter extends Readable {
  readonly source: BaseStream<true>;
  constructor(source: BaseStream<true>) {
    super();
    this.source = source;
  }
  _read(size: number): void {
    this.push(this.source.pull(size));
  }
}

export class WhatwgStreamIAdapter extends BaseStream<true> {
  isAsync: true = true;
  readonly source: ReadableStream;
  reader: ReadableStreamDefaultReader;

  constructor(source: ReadableStream) {
    super();
    this.source = source;
    this.reader = this.source.getReader();
  }

  async _pull(ideal: number): Promise<Uint8Array<ArrayBufferLike>> {
    const result = await this.reader.read();
    if (result.done) {
      this.close();
    }
    return result.value;
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
