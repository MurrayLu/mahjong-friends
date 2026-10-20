/** Only use on canvas-generated JPEG, never as a substitute for decoding originals. */
export function sanitizeGeneratedJpeg(buffer: ArrayBuffer): ArrayBuffer {
  const b = new Uint8Array(buffer);
  const fail = (): never => {
    throw Object.assign(new Error("Invalid generated JPEG"), {
      code: "IMAGE_PROCESS_FAILED",
      category: "SANITIZE",
    });
  };
  if (b.length < 4 || b[0] !== 255 || b[1] !== 216) return fail();
  const parts: Uint8Array[] = [b.slice(0, 2)];
  let p = 2,
    ended = false;
  while (p < b.length) {
    const start = p;
    if (b[p++] !== 255) return fail();
    while (b[p] === 255) p++;
    const marker = b[p++];
    if (marker === 0xd9) {
      parts.push(b.slice(start, p));
      ended = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.slice(start, p));
      continue;
    }
    if (marker === 0 || marker === undefined || p + 2 > b.length) return fail();
    const length = (b[p] << 8) | b[p + 1];
    if (length < 2 || p + length > b.length) return fail();
    if (marker === 0xda) {
      // Preserve encoded scans, stuffing, restart markers and progressive scan tables verbatim.
      if (b[b.length - 2] !== 255 || b[b.length - 1] !== 217) return fail();
      parts.push(b.slice(start));
      ended = true;
      break;
    }
    if (![0xe1, 0xed, 0xfe].includes(marker))
      parts.push(b.slice(start, p + length));
    p += length;
  }
  if (!ended) return fail();
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}
