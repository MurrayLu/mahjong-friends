// Runtime-neutral encoded-byte inspection shared by browser and server.
function ensure(ok: unknown, code: string, status = 400): asserts ok {
  if (!ok) throw Object.assign(new Error(code), { code, status });
}
export const MAX_IMAGE_BYTES = 500 * 1024;
export const HIGHLIGHT_MAX_IMAGE_BYTES = 1024 * 1024;
export const imageByteLimit = (purpose: ImagePurpose) =>
  purpose === "Avatar" ? MAX_IMAGE_BYTES : HIGHLIGHT_MAX_IMAGE_BYTES;
export type ImagePurpose = "Avatar" | "Highlight";
// Read dimensions from the encoded bytes, never from client supplied headers.
export function inspectImage(
  buffer: ArrayBuffer,
  claimedType: string,
  purpose: ImagePurpose,
) {
  ensure(
    buffer.byteLength > 0 && buffer.byteLength <= imageByteLimit(purpose),
    "IMAGE_TOO_LARGE",
    413,
  );
  const b = new Uint8Array(buffer),
    v = new DataView(buffer);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...b.slice(start, end));
  let mime = "",
    width = 0,
    height = 0;
  let originalMetadata = false;
  if (
    b.length >= 33 &&
    ascii(0, 8) === "\x89PNG\r\n\x1a\n" &&
    ascii(12, 16) === "IHDR"
  ) {
    mime = "image/png";
    width = v.getUint32(16);
    height = v.getUint32(20);
    for (let p = 8; p + 12 <= b.length;) {
      const size = v.getUint32(p),
        kind = ascii(p + 4, p + 8);
      if (["eXIf", "tEXt", "iTXt", "zTXt"].includes(kind))
        originalMetadata = true;
      if (size > b.length - p - 12) break;
      p += size + 12;
    }
  } else if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) {
    mime = "image/jpeg";
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p++] !== 255) break;
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > b.length) break;
      const n = v.getUint16(p);
      if (n < 2 || p + n > b.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && n >= 8) {
        height = v.getUint16(p + 3);
        width = v.getUint16(p + 5);
      }
      if ([0xe1, 0xed, 0xfe].includes(marker)) originalMetadata = true;
      p += n;
    }
  } else if (
    b.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP"
  ) {
    mime = "image/webp";
    for (let p = 12; p + 8 <= b.length;) {
      const kind = ascii(p, p + 4),
        size = v.getUint32(p + 4, true);
      if (["EXIF", "XMP "].includes(kind)) originalMetadata = true;
      if (size > b.length - p - 8) break;
      p += 8 + size + (size % 2);
    }
    const kind = ascii(12, 16);
    if (kind === "VP8X") {
      width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    }
    if (kind === "VP8 " && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) {
      width = v.getUint16(26, true) & 0x3fff;
      height = v.getUint16(28, true) & 0x3fff;
    }
    if (kind === "VP8L" && b[20] === 0x2f) {
      const n = v.getUint32(21, true);
      width = (n & 0x3fff) + 1;
      height = ((n >>> 14) & 0x3fff) + 1;
    }
  }
  ensure(mime && mime === claimedType, "IMAGE_UNSUPPORTED", 415);
  ensure(!originalMetadata, "IMAGE_UNPROCESSED", 415);
  ensure(width > 0 && height > 0, "IMAGE_DECODE_FAILED");
  ensure(
    purpose === "Avatar"
      ? width === height && width <= 512
      : Math.max(width, height) <= 1600,
    "IMAGE_INVALID_DIMENSIONS",
  );
  return { MimeType: mime, Width: width, Height: height, ByteSize: b.length };
}
