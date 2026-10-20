import { DomainError } from "../domain/rules";
export function isQuotaError(error: unknown) {
  return /quota|daily.*limit|read.*limit|write.*limit|storage.*limit|10048|10049/i.test(
    String(error),
  );
}
export function storageError(error: unknown) {
  if (error instanceof DomainError) return error;
  if (isQuotaError(error))
    return new DomainError("FREE_TIER_LIMIT_REACHED", 503);
  if (String(error).includes("IMAGE_LIMIT_REACHED"))
    return new DomainError("IMAGE_LIMIT_REACHED", 409);
  return new DomainError("IMAGE_UPLOAD_FAILED", 503);
}
export function mediaLog(
  operation: string,
  purpose: string,
  byteSize: number,
  error: unknown,
  storageKey?: string,
) {
  console.error(
    JSON.stringify({
      requestId: crypto.randomUUID(),
      operation,
      purpose,
      byteSize,
      errorCategory: storageError(error).code,
      ...(storageKey ? { orphanStorageKey: storageKey } : {}),
    }),
  );
}
