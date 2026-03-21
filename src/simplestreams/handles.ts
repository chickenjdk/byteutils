import { ChunkReader } from "../chunkReader.js";
import { MaybePromise } from "../types.js";
import { BaseStream, Sourced } from "./base.js";

export class StreamHandle<IsAsync extends boolean>
  extends ChunkReader<IsAsync>
  implements Sourced<BaseStream<IsAsync>>
{
  readonly source: BaseStream<IsAsync>;

  constructor(source: BaseStream<IsAsync>, isAsync: IsAsync) {
    super(isAsync);
    this.source = source;
  }

  getChunk(
    idealLength: number,
  ): MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync> {
    const pulled = this.source.pull(idealLength);

    return pulled;
  }
}
