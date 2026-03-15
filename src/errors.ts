import { createClassifiedError } from "@chickenjdk/common";

export const ByteutilsError = createClassifiedError("Byteutils");

export const ExpectedAsyncError = createClassifiedError(
  "Expected a promise-like value, but did not receive one. Things will still work.",
  ByteutilsError,
  false,
);
export const ExpectedSyncError = createClassifiedError(
  "Expected a non promise-like value, but received a promise-like value.",
  ByteutilsError,
  true,
);

export const StreamClosedError = createClassifiedError(
  "Stream is closed!",
  ByteutilsError,
  true,
);
