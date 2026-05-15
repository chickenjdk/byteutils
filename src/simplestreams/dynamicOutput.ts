import FastFIFO from "fast-fifo";
import {
  knownPromiseThen,
  LockQueue,
  maybePromiseResolve,
  SimpleEventEmitter,
  SimpleEventListener,
  wrapForLockIfNeeded,
} from "../common.js";
import { CanNotWaitDueToSyncError } from "../errors.js";
import { MaybePromise } from "../types.js";
import { BaseStream, baseStreamEvents, Sourced } from "./base.js";
import { PrependSource } from "./prependSource.js";

// TODO: Make this a DynamicOutputConsumer?
export class DynamicOutput<IsAsync extends boolean> implements Sourced<
  BaseStream<IsAsync> | undefined
> {
  readonly isAsync: IsAsync;
  #output: DynamicOutputConsumer<IsAsync> | undefined;
  #lock: LockQueue | undefined;
  #actualSource: PrependSource<IsAsync>;
  readonly source: BaseStream<IsAsync>;
  /**
   * Switches where data goes to.
   * @param source The source
   * @param isAsync If the class is async
   */
  constructor(source: BaseStream<IsAsync>, isAsync: IsAsync) {
    this.source = source;
    this.isAsync = isAsync;
    if (isAsync) {
      this.#lock = new LockQueue();
    }
    this.#actualSource = new PrependSource(this.isAsync);
    this.#actualSource._useSource_(source);
  }

  switchOutput(
    output: DynamicOutputConsumer<IsAsync>,
  ): MaybePromise<void, IsAsync> {
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      const switchSource = () => {
        this.#output = output;
        output._useSource_(this.#actualSource);
      };
      if (this.#output) {
        return knownPromiseThen(
          this.#output._queueDump_(),
          (value) => {
            this.#actualSource.pushPrependQueue(value);
            switchSource();
          },
          this.isAsync,
        );
      } else {
        return maybePromiseResolve(switchSource(), this.isAsync);
      }
    });
  }
}

export interface DynamicOutputConsumerEventMap {
  sourceChange: SimpleEventListener<void, "sourceChange">;
  sourceAvailable: SimpleEventListener<void, "sourceAvailable">;
}

export abstract class DynamicOutputConsumer<
  IsAsync extends boolean,
> implements Sourced<BaseStream<IsAsync> | undefined> {
  source: BaseStream<IsAsync> | undefined;
  abstract isAsync: boolean;
  abstract events: SimpleEventEmitter<DynamicOutputConsumerEventMap>;
  /**
   * INTERNAL
   * SHOULD ONLY BE CALLED BY DynamicOutput
   * Dump any unused but buffered data
   */
  abstract _queueDump_(): MaybePromise<Uint8Array[], IsAsync>;
  /**
   * Set the source used for getting data.
   * INTERNAL.
   * SHOULD ONLY BE CALLED BY DynamicOutput
   * @param source The source stream
   */
  _useSource_(source: BaseStream<IsAsync> | undefined): void {
    this.source = source;
    this.events.emit("sourceChange", undefined);
    if (source !== undefined) {
      this.events.emit("sourceAvailable", undefined);
    }
  }
  /**
   * Gets the source, if not present, it returns a promise that waits for it if async or throwing if sync
   */
  getSource(): MaybePromise<BaseStream<IsAsync>, IsAsync> {
    if (this.source === undefined) {
      if (this.isAsync) {
        return new Promise((resolve) => {
          this.events.once("sourceAvailable", () => {
            resolve(this.source!);
          });
        }) as MaybePromise<BaseStream<IsAsync>, IsAsync>;
      } else {
        throw new CanNotWaitDueToSyncError(
          "Due to being in sync mode, can not wait for source to be available",
        );
      }
    } else {
      return maybePromiseResolve(this.source, this.isAsync) as MaybePromise<
        BaseStream<IsAsync>,
        IsAsync
      >;
    }
  }
}
