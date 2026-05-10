import FastFIFO from "fast-fifo";
import {
  knownPromiseThen,
  LockQueue,
  maybePromiseResolve,
  SimpleEventEmitter,
  wrapForLockIfNeeded,
} from "../common.js";
import { MaybePromise } from "../types.js";
import { BaseStream, baseStreamEvents, Sourced } from "./base.js";
import { log } from "@chickenjdk/common";

export class TeeStreamOutput<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements Sourced<TeeStream<IsAsync>>
{
  readonly isAsync: IsAsync;
  readonly events: SimpleEventEmitter<baseStreamEvents>;
  readonly source: TeeStream<IsAsync>;
  #controller: TeeStreamController<IsAsync>;
  constructor(
    isAsync: IsAsync,
    source: TeeStream<IsAsync>,
    controller: TeeStreamController<IsAsync>,
  ) {
    super();
    this.source = source;
    this.isAsync = isAsync;
    this.#controller = controller;
    this.events = new SimpleEventEmitter<baseStreamEvents>();
  }
  _pull(ideal: number) {
    const queue = this.#controller.getQueue();
    if (queue.isEmpty()) {
      return knownPromiseThen(
        this.#controller.pullIntoQueue(ideal),
        () => {
          return queue.shift()!;
        },
        this.isAsync,
      );
    } else {
      return maybePromiseResolve(queue.shift()!, this.isAsync);
    }
  }
  _dumpQueue(): MaybePromise<Uint8Array<ArrayBufferLike>[], IsAsync> {
    const queue = this.#controller.getQueue();
    const items = [];
    while (true) {
      const item = queue.shift();
      if (item === undefined) {
        break;
      } else {
        items.push(item);
      }
    }
    return maybePromiseResolve(items, this.isAsync);
  }
}
// This class should not be possible to get a reference to an instance of, so is therefore not exported
abstract class TeeStreamController<IsAsync extends boolean> {
  abstract readonly queue: FastFIFO<Uint8Array>;
  abstract getQueue(): FastFIFO<Uint8Array>;
  abstract pullIntoQueue(ideal: number): MaybePromise<void, IsAsync>;
}
export class TeeStream<IsAsync extends boolean> implements Sourced<
  BaseStream<IsAsync>
> {
  readonly source: BaseStream<IsAsync>;
  readonly isAsync: IsAsync;
  #queues: Set<WeakRef<TeeStreamController<IsAsync>>>;
  #lock: LockQueue | undefined;

  constructor(source: BaseStream<IsAsync>, isAsync: IsAsync) {
    this.source = source;
    this.isAsync = isAsync;
    this.#queues = new Set();
    if (isAsync) {
      this.#lock = new LockQueue();
    }
  }
  #getQueues() {
    const output = [];
    for (const queueRef of this.#queues) {
      const queue = queueRef.deref();
      if (queue === undefined) {
        this.#queues.delete(queueRef);
      } else {
        output.push(queue);
      }
    }
    return output;
  }
  createTee(): TeeStreamOutput<IsAsync> {
    const self = this;
    const queue = new FastFIFO<Uint8Array>();
    const controller = new (class extends TeeStreamController<IsAsync> {
      queue: FastFIFO<Uint8Array> = queue;
      getQueue(): FastFIFO<Uint8Array> {
        return queue;
      }
      pullIntoQueue(ideal: number): MaybePromise<void, IsAsync> {
        if (queue.length > 0) {
          log(
            "warning",
            "In TeeStream, a pull was attempted while data is present. This should not happen.",
          );
        }
        return wrapForLockIfNeeded(self.isAsync, self.#lock, () => {
          // By the time we get the lock, someone else might have gotten the data
          if (queue.length > 0) {
            return knownPromiseThen(
              self.source.pull(ideal),
              (data) => {
                for (const queue of self.#getQueues()) {
                  queue.queue.push(data);
                }
              },
              self.isAsync,
            );
          } else {
            return maybePromiseResolve(undefined, self.isAsync);
          }
        });
      }
    })();
    const stream = new TeeStreamOutput(this.isAsync, this, controller);
    this.#queues.add(new WeakRef(controller));
    return stream;
  }
}
