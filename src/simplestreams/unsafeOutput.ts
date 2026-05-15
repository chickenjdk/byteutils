import {
  knownPromiseThen,
  maybePromiseResolve,
  SimpleEventEmitter,
} from "../common.js";
import { MaybePromise } from "../types.js";
import { BaseStream, baseStreamEvents } from "./base.js";
import {
  DynamicOutputConsumer,
  DynamicOutputConsumerEventMap,
} from "./dynamicOutput.js";

export class UnsafeOutput<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements DynamicOutputConsumer<IsAsync>
{
  source: BaseStream<IsAsync> | undefined;
  readonly isAsync: IsAsync;
  readonly events: SimpleEventEmitter<
    DynamicOutputConsumerEventMap & baseStreamEvents
  >;
  /**
   * An output for an dynamicOutput instance that can not dump its queue.
   * This can cause issues, hence the name UnsafeOutput
   * @param isAsync
   */
  constructor(isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    this.events = new SimpleEventEmitter();
  }
  _pull(ideal: number) {
    return knownPromiseThen(
      this.getSource(),
      (source) => {
        return source.pull(ideal);
      },
      this.isAsync,
    ) as MaybePromise<Uint8Array, IsAsync>;
  }
  _queueDump_() {
    return maybePromiseResolve([], this.isAsync);
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
