import {
  ErrorLock,
  knownPromiseThen,
  LockQueue,
  maybePromiseResolve,
  SimpleEventEmitter,
} from "../common.js";
import { ByteutilsError } from "../errors.js";
import { MaybePromise } from "../types.js";
import { BaseStream, baseStreamEvents, Sourced } from "./base.js";
import {
  DynamicOutputConsumer,
  DynamicOutputConsumerEventMap,
} from "./dynamicOutput.js";
import { PrependSource } from "./prependSource.js";

export class StreamSlice<IsAsync extends boolean> extends BaseStream<IsAsync> {
  readonly events: SimpleEventEmitter<baseStreamEvents>;
  readonly isAsync: IsAsync;
  #dataLeft: MaybePromise<number, IsAsync>;
  #pull: (
    ideal: number,
    max: number,
  ) => MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
  constructor(
    pull: (
      ideal: number,
      max: number,
    ) => MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>,
    readLimit: number,
    isAsync: IsAsync,
  ) {
    super();
    this.isAsync = isAsync;
    this.events = new SimpleEventEmitter();
    this.#dataLeft = maybePromiseResolve(readLimit, this.isAsync);
    this.#pull = pull;
  }
  _pull(ideal: number): MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync> {
    return knownPromiseThen(
      this.#dataLeft,
      (dataLeft) => {
        const maxBytes = dataLeft;
        const result = this.#pull(Math.min(ideal, maxBytes), maxBytes);
        this.#dataLeft = knownPromiseThen(
          result,
          (val) => {
            const newDataLeft = dataLeft - val.length;
            if (newDataLeft < 0) {
              throw new ByteutilsError("Data over-read");
            }
            if (newDataLeft === 0) {
              this.close();
            }
            return newDataLeft;
          },
          this.isAsync,
        );
        return result;
      },
      this.isAsync,
    ) as MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
  }
}
// Can make switchable because it does have a stream as a source
export class StreamSlicer<IsAsync extends boolean>
  implements
    Sourced<BaseStream<IsAsync> | undefined>,
    DynamicOutputConsumer<IsAsync>
{
  readonly source: BaseStream<IsAsync> | undefined;
  readonly isAsync: IsAsync;
  readonly events: SimpleEventEmitter<DynamicOutputConsumerEventMap>;
  #lock: LockQueue | ErrorLock;
  #prependSource: PrependSource<IsAsync>;
  /**
   * Create streams that have a predetermined amount of data from the source, then close.
   * If a stream does not read data, this blocks all other streams from getting any, even if the backend already has data.
   * @param source
   * @param isAsync
   */
  constructor(isAsync: IsAsync) {
    this.isAsync = isAsync;
    this.#prependSource = new PrependSource(this.isAsync);
    this.events = new SimpleEventEmitter();
    if (this.isAsync) {
      this.#lock = new LockQueue();
    } else {
      this.#lock = new ErrorLock();
    }
  }
  readStream(bytes: number) {
    return knownPromiseThen(
      this.#lock.acquire() as MaybePromise<void, IsAsync>,
      () => {
        const instance = new StreamSlice(
          (ideal, max) => {
            return knownPromiseThen(
              this.#prependSource.pull(ideal),
              (chunk) => {
                if (chunk.length > max) {
                  this.#prependSource.pushPrependQueue([chunk.subarray(max)]);
                  return chunk.subarray(0, max);
                } else {
                  return chunk;
                }
              },
              this.isAsync,
            );
          },
          bytes,
          this.isAsync,
        );
        instance.events.once("close", () => {
          this.#lock.release();
        });
        return instance;
      },
      this.isAsync,
    );
  }

  _queueDump_() {
    return this.#prependSource._queueDump_();
  }

  _useSource_(source: BaseStream<IsAsync>): void {
    this.#prependSource._useSource_(source);
    return DynamicOutputConsumer.prototype._useSource_.call(this, source);
  }

  getSource() {
    return DynamicOutputConsumer.prototype.getSource.call(this) as MaybePromise<
      BaseStream<IsAsync>,
      IsAsync
    >;
  }
}
