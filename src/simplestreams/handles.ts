import { ChunkReader } from "../chunkReader.js";
import { knownPromiseThen, SimpleEventEmitter } from "../common.js";
import { MaybePromise } from "../types.js";
import { BaseStream } from "./base.js";
import {
  DynamicOutputConsumer,
  DynamicOutputConsumerEventMap,
} from "./dynamicOutput.js";

// Switchable because it does have a stream as a source
export class StreamHandle<IsAsync extends boolean>
  extends ChunkReader<IsAsync>
  implements DynamicOutputConsumer<IsAsync>
{
  source: BaseStream<IsAsync> | undefined;
  events: SimpleEventEmitter<DynamicOutputConsumerEventMap>;
  constructor(isAsync: IsAsync) {
    super(isAsync);
    this.events = new SimpleEventEmitter();
  }

  getChunk(
    idealLength: number,
  ): MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync> {
    return knownPromiseThen(
      this.getSource(),
      (source) => {
        return source.pull(idealLength);
      },
      this.isAsync,
    ) as MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
  }

  _queueDump_() {
    return knownPromiseThen(
      this.consumeChunk(),
      (v) => {
        return [v];
      },
      this.isAsync,
    );
  }

  _useSource_(source: BaseStream<IsAsync>): void {
    return DynamicOutputConsumer.prototype._useSource_.call(this, source);
  }

  getSource() {
    return DynamicOutputConsumer.prototype.getSource.call(this) as MaybePromise<
      BaseStream<IsAsync>,
      IsAsync
    >;
  }
}
