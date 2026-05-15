import { BaseStream, Sourced } from "./base.js";
import { StreamHandle } from "./handles.js";

// Switchable via switching the source
export abstract class Transform<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements Sourced<StreamHandle<IsAsync>>
{
  readonly source: StreamHandle<IsAsync>;
  constructor(
    isAsync: IsAsync,
    streamHandleClass: typeof StreamHandle = StreamHandle,
  ) {
    super();
    this.source = new streamHandleClass(isAsync);
    this.isAsync = isAsync;
  }
  isAsync: IsAsync;
}
