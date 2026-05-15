import FastFIFO from "fast-fifo";
import {
  SimpleEventEmitter,
  knownPromiseThen,
  maybePromiseResolve,
} from "../common.js";
import { MaybePromise } from "../types.js";
import { BaseStream, Sourced, baseStreamEvents } from "./base.js";
import {
  DynamicOutputConsumer,
  DynamicOutputConsumerEventMap,
} from "./dynamicOutput.js";

export class PrependSource<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements DynamicOutputConsumer<IsAsync>
{
  isAsync: IsAsync;
  events: SimpleEventEmitter<baseStreamEvents & DynamicOutputConsumerEventMap>;
  #prependedData: FastFIFO<Uint8Array>;
  source: BaseStream<IsAsync> | undefined;
  constructor(isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    this.events = new SimpleEventEmitter();
    this.#prependedData = new FastFIFO();
  }
  /**
   * Pushes data to the end of the prepend queue
   * @param data
   */
  pushPrependQueue(data: Uint8Array[]) {
    for (const item of data) {
      this.#prependedData.push(item);
    }
  }
  _pull(ideal: number): MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync> {
    // WARNING: This will not wait for a source if there is buffered data
    if (this.#prependedData.isEmpty()) {
      return knownPromiseThen(
        this.getSource(),
        (source) => {
          return source.pull(ideal);
        },
        this.isAsync,
      ) as MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
    } else {
      return maybePromiseResolve(this.#prependedData.shift()!, this.isAsync);
    }
  }
  _queueDump_() {
    const chunks = [];
    while (!this.#prependedData.isEmpty()) {
      chunks.push(this.#prependedData.shift()!);
    }
    return maybePromiseResolve(chunks, this.isAsync);
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
