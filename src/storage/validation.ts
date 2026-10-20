import { ensure } from "../domain/rules";
import { inspectImage as inspect } from "../shared/image-inspection";
import type { ImagePurpose } from "../shared/image-inspection";
export {
  MAX_IMAGE_BYTES,
  HIGHLIGHT_MAX_IMAGE_BYTES,
  imageByteLimit,
} from "../shared/image-inspection";
export type { ImagePurpose } from "../shared/image-inspection";
export function inspectImage(
  buffer: ArrayBuffer,
  claimedType: string,
  purpose: ImagePurpose,
) {
  try {
    return inspect(buffer, claimedType, purpose);
  } catch (error) {
    const e = error as { code?: string; status?: number };
    ensure(false, e.code || "IMAGE_DECODE_FAILED", e.status || 400);
    throw error;
  }
}
