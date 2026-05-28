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

export interface DynamicSourceEvents extends baseStreamEvents {
  sourceChange: SimpleEventListener<void, "sourceChange">;
  sourceAvailable: SimpleEventListener<void, "sourceAvailable">;
}

export class DynamicSource<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements Sourced<BaseStream<IsAsync> | undefined>
{
  readonly isAsync: IsAsync;
  readonly events: SimpleEventEmitter<DynamicSourceEvents>;
  #lock: LockQueue | undefined;
  #source: BaseStream<IsAsync> | undefined;
  #temporaryCallbacks:
    | [keyof baseStreamEvents, SimpleEventListener<any, string>][]
    | undefined;
  get source() {
    return this.#source;
  }
  /**
   * Create a dynamic source.
   * This relays all pulls to the current source, which may be changed.
   * If this stream is closed, the current source will be too.
   * @param isAsync If the class is async
   */
  constructor(isAsync: IsAsync) {
    super();
    this.isAsync = isAsync;
    if (isAsync) {
      this.#lock = new LockQueue();
    }
    this.events = new SimpleEventEmitter<DynamicSourceEvents>();
  }
  setSource(
    newSource: BaseStream<IsAsync> | undefined,
  ): MaybePromise<void, IsAsync> {
    const setSource = () => {
      this.#source = newSource;
      if (newSource) {
        const callback = () => {
          this._setPullableState(newSource.pullable);
        };
        this.#temporaryCallbacks = [["pullableStateChange", callback]];
        newSource?.events.on("pullableStateChange", callback);
        this._setPullableState(newSource.pullable);
      } else {
        this._setPullableState(false);
      }
      this.events.emit("sourceChange", undefined);
      if (newSource) {
        this.events.emit("sourceAvailable", undefined);
      }
    };
    // We don't use the lock here, as that would trigger deadlocks with pull if the source ends. _pull must keep its own reference to #source to keep things safe
    if (this.#source === undefined) {
      this.#source = newSource;
      setSource();
      return maybePromiseResolve(undefined, this.isAsync);
    } else {
      if (this.#temporaryCallbacks) {
        for (const [name, cb] of this.#temporaryCallbacks) {
          this.#source?.events.off(name, cb);
        }
      }
      setSource();
      return maybePromiseResolve(undefined, this.isAsync);
    }
  }
  _pull(
    ideal: number,
    __ignoreLock__ = false,
  ): MaybePromise<Uint8Array, IsAsync> {
    return wrapForLockIfNeeded(
      this.isAsync && !__ignoreLock__,
      this.#lock,
      () => {
        const source = this.#source;
        if (source === undefined || source.closed) {
          if (this.isAsync) {
            return new Promise<void | null>((resolve) => {
              const closeCb = () => {
                resolve(null);
              };
              this.events.once("close", closeCb);
              this.events.once("sourceAvailable", () => {
                resolve();
                this.events.off("close", closeCb);
              });
            }).then((val) => {
              if (val === null) {
                return null;
              }
              const value = this.#source!.pull(ideal);
              return knownPromiseThen(
                value,
                (result) => {
                  if (result === null && !this.closed) {
                    return this._pull(ideal, true);
                  } else {
                    return result;
                  }
                },
                this.isAsync,
              );
            });
          } else {
            throw new CanNotWaitDueToSyncError(
              "No source is present, but tried to pull",
            );
          }
        } else {
          const value = source.pull(ideal);
          return knownPromiseThen(
            value,
            (result) => {
              if (result === null && !this.closed) {
                return this._pull(ideal, true);
              } else {
                return result;
              }
            },
            this.isAsync,
          );
        }
      },
    ) as MaybePromise<Uint8Array<ArrayBufferLike>, IsAsync>;
  }
  close() {
    super.close();
  }
}
