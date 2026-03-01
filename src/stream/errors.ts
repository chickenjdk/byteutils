import { createClassifiedError } from "@chickenjdk/common";
import { ByteutilsError } from "../errors.js";
export const StreamsError = createClassifiedError("Streams", ByteutilsError);
export const StreamEndedError = createClassifiedError("Streams", StreamsError);
