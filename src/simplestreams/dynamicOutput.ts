import {
  LockQueue,
  wrapForLockIfNeeded,
} from "../common.js";
import { BaseStream, Sourced } from "./base.js";
import { DynamicSource } from "./dynamicSource.js";

export class DynamicOutput<IsAsync extends boolean> implements Sourced<
  BaseStream<IsAsync> | undefined
> {
  readonly isAsync: IsAsync;
  #lock: LockQueue | undefined;
  #output: DynamicSource<IsAsync> | undefined;
  // no "switch queue" is needed because dynamicSource is a proxy to our source stream, and does not queue data
  get output() {
    return this.#output;
  }
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
  }

  switchOutput(stream: DynamicSource<IsAsync>) {
    return wrapForLockIfNeeded(this.isAsync, this.#lock, () => {
      this.#output?.setSource(undefined);
      this.#output = stream;
      stream.setSource(this.source);
    });
  }
}
