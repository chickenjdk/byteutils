import { MUtf8Decoder, MUtf8Encoder } from "mutf-8";
const MUtf8DecoderInstance = new MUtf8Decoder();
const MUtf8EncoderInstance = new MUtf8Encoder();
const TextEncoderInstance = new TextEncoder();
const TextDecoderInstance = new TextDecoder();
export const encodeMutf8 = MUtf8EncoderInstance.encode.bind(MUtf8EncoderInstance);
export const decodeMutf8 = MUtf8DecoderInstance.decode.bind(MUtf8DecoderInstance);
export const encodeUtf8 = TextEncoderInstance.encode.bind(TextEncoderInstance);
export const decodeUtf8 = TextDecoderInstance.decode.bind(TextDecoderInstance);