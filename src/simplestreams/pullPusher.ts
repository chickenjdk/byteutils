import { MaybePromise } from "../types.js";
import { BaseStream, Sourced } from "./base.js";

export abstract class PullPusher<IsAsync extends boolean> implements Sourced<
  BaseStream<IsAsync>
> {
  readonly source: BaseStream<IsAsync>;
  readonly isAsync: IsAsync;
  ideal: number;
  constructor(
    isAsync: IsAsync,
    source: BaseStream<IsAsync>,
    ideal: number = 2000,
  ) {
    this.isAsync = isAsync;
    this.source = source;
    this.ideal = ideal;
    this.pullLoop();
  }
  private pullLoop() {
    // Either way, we still need this in an async function, so no harm in awaiting .pull
    return (async () => {
      while (true) {
        if (this.source.closed) {
          break;
        }
        if (this.source.pullable) {
          const pulled = await this.source.pull(this.ideal);
          if (pulled.length > 0) {
            await this.pushed(pulled);
          }
        } else {
          await new Promise<void>((resolve) => {
            this.source.events.once("pullableStateChange", (state) => {
              if (state === true) {
                resolve();
              }
            });
          });
        }
      }
    })();
  }
  abstract pushed(data: Uint8Array): MaybePromise<void, IsAsync>;
}
