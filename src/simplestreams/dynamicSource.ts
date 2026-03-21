import {
  LockQueue,
  maybePromiseResolve,
  noDataUint8Array,
  SimpleEventEmitter,
  SimpleEventListener,
  wrapForLockIfNeeded,
} from "../common.js";
import { MaybePromise } from "../types.js";
import { BaseStream, baseStreamEvents, Sourced } from "./base.js";

export interface DynamicSourceEvents extends baseStreamEvents {
  sourceChange: SimpleEventListener<void, "sourceChange">;
}

export class DynamicSource<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements Sourced<BaseStream<IsAsync> | undefined>
{
  readonly isAsync: IsAsync;
  readonly events: SimpleEventEmitter<DynamicSourceEvents>;
  #lock: LockQueue | undefined;
  #source: BaseStream<IsAsync> | undefined;
  #boundRelayEvent: (arg: any, name: keyof DynamicSourceEvents) => void;
  get source() {
    return this.#source;
  }
  constructor(isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    if (isAsync) {
      this.#lock = new LockQueue();
    }
    this.events = new SimpleEventEmitter<DynamicSourceEvents>();
    this.#boundRelayEvent = function (
      this: DynamicSource<IsAsync>,
      arg: any,
      name: keyof DynamicSourceEvents,
    ) {
      this.events.emit(name, arg);
    }.bind(this);
  }
  setSource(newSource: BaseStream<IsAsync>): MaybePromise<void, IsAsync> {
    // Skip the lock queue if there is not a source left, because those in front of us in the queue are waiting for the source.
    if (this.#source === undefined) {
      this.#source = newSource;
      this.#source.events.on("pullableStateChange", this.#boundRelayEvent);
      this.events.emit("sourceChange", undefined);
      return maybePromiseResolve(undefined, this.isAsync);
    } else {
      return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
        // @ts-ignore
        this.#source.events.off("pullableStateChange", this.#boundRelayEvent);
        this.#source = newSource;
        this.#source.events.on("pullableStateChange", this.#boundRelayEvent);
        this.events.emit("sourceChange", undefined);
        return maybePromiseResolve(undefined, this.isAsync);
      });
    }
  }
  _pull(ideal: number): MaybePromise<Uint8Array, IsAsync> {
    // @ts-ignore
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      if (this.#source === undefined) {
        if (this.isAsync) {
          return new Promise<void>((resolve) =>
            this.events.once("sourceChange", resolve),
          ).then(() => this.#source!.pull(ideal));
        } else {
          return noDataUint8Array;
        }
      } else {
        return this.#source.pull(ideal);
      }
    });
  }
}
