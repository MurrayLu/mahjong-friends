import { inspectImage, imageByteLimit } from "../shared/image-inspection";
import { sanitizeGeneratedJpeg } from "../shared/jpeg-sanitizer";
export const RAW_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const PROCESSED_IMAGE_MAX_BYTES = 1024 * 1024;
export type Purpose = "Avatar" | "Highlight";
export type ImageStage =
  | "FILE_SELECTED"
  | "DECODING"
  | "NORMALIZING"
  | "RESIZING"
  | "ENCODING"
  | "UPLOADING"
  | "LINKING_HIGHLIGHT";
export type ImageProgress = (
  stage: ImageStage,
  metadata?: {
    mime?: string;
    byteSize?: number;
    width?: number;
    height?: number;
    decoder?: string;
    preflight?: string;
    fallbackReason?: string;
  },
) => void;
export const imageStageLabel = (stage: ImageStage | null) =>
  stage === "UPLOADING"
    ? "正在上傳照片…"
    : stage === "LINKING_HIGHLIGHT"
      ? "正在儲存精華…"
      : "正在處理照片…";
export class ImageError extends Error {
  constructor(
    public code: string,
    public category:
      | "DECODE"
      | "CANVAS"
      | "ENCODE"
      | "SANITIZE"
      | "SIZE"
      | "UPLOAD" = "DECODE",
  ) {
    super(imageMessage(code));
  }
}
export function imageMessage(code: string) {
  return (
    (
      {
        IMAGE_TOO_LARGE: "照片檔案太大，請選擇一般照片或截圖。",
        IMAGE_UNSUPPORTED: "不支援這個圖片格式。",
        IMAGE_UNPROCESSED: "照片需要先處理，請重新選擇照片上傳。",
        IMAGE_DECODE_FAILED: "照片無法讀取，請選擇另一張照片。",
        IMAGE_PROCESS_FAILED: "照片處理失敗，請再試一次。",
        IMAGE_UPLOAD_FAILED: "照片上傳失敗，請稍後再試。",
        IMAGE_LIMIT_REACHED: "每則精華最多四張照片。",
        IMAGE_NOT_FOUND: "找不到照片。",
        IMAGE_FORBIDDEN: "你沒有操作這張照片的權限。",
        FREE_TIER_LIMIT_REACHED: "目前免費服務額度已達上限，請稍後再試。",
      } as Record<string, string>
    )[code] || "照片上傳未完成，請稍後再試。"
  );
}
export function imageGeometry(
  width: number,
  height: number,
  purpose: Purpose,
  edge = purpose === "Avatar" ? 512 : 1600,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 64_000_000
  )
    throw new ImageError("IMAGE_DECODE_FAILED");
  const side = Math.min(width, height),
    sw = purpose === "Avatar" ? side : width,
    sh = purpose === "Avatar" ? side : height;
  const scale = Math.min(1, edge / Math.max(sw, sh));
  return {
    sx: purpose === "Avatar" ? (width - side) / 2 : 0,
    sy: purpose === "Avatar" ? (height - side) / 2 : 0,
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}
type Geometry = ReturnType<typeof imageGeometry>;
export interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}
export interface ImageRuntime {
  nativeDecode(file: Blob): Promise<Decoded>;
  heicDecode(file: Blob): Promise<Decoded>;
  encode(
    image: Decoded,
    geometry: Geometry,
    mime: string,
    quality: number,
  ): Promise<Blob>;
}
async function nativeDecode(file: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    // Safari's HTMLImageElement path can decode formats unavailable to createImageBitmap.
    const url = URL.createObjectURL(file),
      image = new Image();
    try {
      image.src = url;
      await image.decode();
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}
async function heicDecode(_file: Blob): Promise<Decoded> { throw new ImageError("HEIC_DECODE_FAILED"); }
async function encode(
  image: Decoded,
  g: Geometry,
  mime: string,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = g.width;
  canvas.height = g.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("IMAGE_PROCESS_FAILED", "CANVAS");
    // Flatten transparency for a predictable JPEG fallback. Canvas encoding drops input EXIF/GPS.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.drawImage(
      image.source,
      g.sx,
      g.sy,
      g.sw,
      g.sh,
      0,
      0,
      g.width,
      g.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new ImageError("IMAGE_PROCESS_FAILED", "ENCODE")),
        mime,
        quality,
      ),
    );
    return blob;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
const browserRuntime: ImageRuntime = { nativeDecode, heicDecode, encode };
export async function isHeic(file: Blob & { name?: string }) {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer()),
    brand = String.fromCharCode(...b.slice(8, 12));
  return (
    /heic|heif/i.test(file.type) ||
    /\.hei[cf]$/i.test(file.name || "") ||
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)
  );
}
/** Uses the server byte inspector, keeping metadata and dimension rules identical. */
export async function inspectProcessedImageMetadata(
  blob: Blob,
  purpose: Purpose = "Highlight",
) {
  try {
    inspectImage(await blob.arrayBuffer(), blob.type, purpose);
    return { clean: true, reason: "CLEAN" };
  } catch (error) {
    return {
      clean: false,
      reason: (error as { code?: string }).code || "IMAGE_PROCESS_FAILED",
    };
  }
}
export async function processImage(
  file: Blob & { name?: string },
  purpose: Purpose,
  runtime: ImageRuntime = browserRuntime,
  progress: ImageProgress = () => {},
) {
  progress("FILE_SELECTED", { mime: file.type, byteSize: file.size });
  if (file.size > RAW_IMAGE_MAX_BYTES)
    throw new ImageError("IMAGE_TOO_LARGE", "SIZE");
  if (!file.size) throw new ImageError("IMAGE_DECODE_FAILED");
  let image: Decoded;
  progress("DECODING", { decoder: "native" });
  try {
    image = await runtime.nativeDecode(file);
  } catch {
    if (!(await isHeic(file))) throw new ImageError("IMAGE_DECODE_FAILED");
    progress("DECODING", { decoder: "heic-worker" });
    try {
      image = await runtime.heicDecode(file);
    } catch {
      throw new ImageError("IMAGE_DECODE_FAILED");
    }
  }
  try {
    progress("NORMALIZING", { width: image.width, height: image.height });
    let jpegOnly = false;
    let rejectedBytes = false;
    const edges =
      purpose === "Avatar" ? [512, 448, 384, 320] : [1600, 1400, 1200, 960];
    for (const edge of edges) {
      const geometry = imageGeometry(image.width, image.height, purpose, edge);
      progress("RESIZING", { width: geometry.width, height: geometry.height });
      for (const quality of [0.88, 0.8, 0.72, 0.62]) {
        let blob: Blob;
        try {
          blob = await runtime.encode(
            image,
            geometry,
            jpegOnly ? "image/jpeg" : "image/webp",
            quality,
          );
        } catch {
          if (jpegOnly) throw new ImageError("IMAGE_PROCESS_FAILED", "ENCODE");
          jpegOnly = true;
          progress("ENCODING", { fallbackReason: "WEBP_ENCODER_FAILED" });
          blob = await runtime.encode(image, geometry, "image/jpeg", quality);
        }
        let preflight = await inspectProcessedImageMetadata(blob, purpose);
        if (
          !jpegOnly &&
          (blob.type !== "image/webp" ||
            (!preflight.clean && preflight.reason !== "IMAGE_TOO_LARGE"))
        ) {
          jpegOnly = true;
          progress("ENCODING", { fallbackReason: preflight.reason });
          blob = await runtime.encode(image, geometry, "image/jpeg", quality);
        }
        if (jpegOnly) {
          if (blob.type !== "image/jpeg")
            throw new ImageError("IMAGE_PROCESS_FAILED", "ENCODE");
          try {
            blob = new Blob([sanitizeGeneratedJpeg(await blob.arrayBuffer())], {
              type: "image/jpeg",
            });
          } catch {
            throw new ImageError("IMAGE_PROCESS_FAILED", "SANITIZE");
          }
        }
        preflight = await inspectProcessedImageMetadata(blob, purpose);
        progress("ENCODING", {
          mime: blob.type,
          byteSize: blob.size,
          preflight: preflight.reason,
        });
        if (!preflight.clean) {
          rejectedBytes ||= preflight.reason !== "IMAGE_TOO_LARGE";
          continue;
        }
        if (blob.size > 0 && blob.size <= imageByteLimit(purpose))
          return { blob, width: geometry.width, height: geometry.height };
      }
    }
    throw new ImageError(
      rejectedBytes ? "IMAGE_PROCESS_FAILED" : "IMAGE_TOO_LARGE",
      rejectedBytes ? "ENCODE" : "SIZE",
    );
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("IMAGE_PROCESS_FAILED");
  } finally {
    image.release();
  }
}
export async function uploadProcessedImage(
  file: File,
  purpose: Purpose,
  path: string,
  onProgress: ImageProgress = () => {},
) {
  const requestId = crypto.randomUUID();
  let stage: ImageStage = "FILE_SELECTED";
  const progress: ImageProgress = (next, metadata) => {
    stage = next;
    console.info(
      JSON.stringify({
        operation: "image-client",
        requestId,
        stage,
        ...metadata,
      }),
    );
    onProgress(next, metadata);
  };
  let processed: Awaited<ReturnType<typeof processImage>>;
  try {
    processed = await processImage(file, purpose, browserRuntime, progress);
  } catch (error) {
    console.warn(
      JSON.stringify({
        operation: "image-client",
        requestId,
        stage,
        errorCategory: error instanceof ImageError ? error.category : "ENCODE",
      }),
    );
    throw error;
  }
  const { blob, width, height } = processed;
  progress("UPLOADING", {
    mime: blob.type,
    byteSize: blob.size,
    width,
    height,
  });
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
  } catch {
    console.warn(
      JSON.stringify({
        operation: "image-client",
        requestId,
        stage,
        errorCategory: "UPLOAD",
        errorCode: "IMAGE_UPLOAD_FAILED",
      }),
    );
    throw new ImageError("IMAGE_UPLOAD_FAILED", "UPLOAD");
  }
  let data: {
    Id: string;
    ImageUrl: string;
    error?: string;
  };
  try {
    data = await response.json();
  } catch {
    throw new ImageError("IMAGE_UPLOAD_FAILED", "UPLOAD");
  }
  if (!response.ok) {
    console.warn(
      JSON.stringify({
        operation: "image-client",
        requestId,
        stage,
        errorCategory: "UPLOAD",
        errorCode: data.error || "IMAGE_UPLOAD_FAILED",
      }),
    );
    throw new ImageError(data.error || "IMAGE_UPLOAD_FAILED", "UPLOAD");
  }
  // Local processed preview avoids a fresh KV read while replication is pending.
  return { ...data, PreviewBlob: blob };
}
