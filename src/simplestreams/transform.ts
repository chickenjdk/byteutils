import { BaseStream, Sourced } from "./base.js";
import { StreamHandle } from "./handles.js";

export abstract class Transform<IsAsync extends boolean>
  extends BaseStream<IsAsync>
  implements Sourced<StreamHandle<IsAsync>>
{
  readonly source: StreamHandle<IsAsync>;
  constructor(source: BaseStream<IsAsync>, isAsync: IsAsync) {
    super();
    this.source = new StreamHandle(source, isAsync);
    this.isAsync = isAsync;
  }
  isAsync: IsAsync;
}
