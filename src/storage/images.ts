export interface ImageStorage {
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
// Only processed image bytes belong here. Relational metadata stays in D1.
export class KvImageStorage implements ImageStorage {
  constructor(private namespace: KVNamespace) {}
  async put(key: string, bytes: ArrayBuffer, contentType: string) {
    await this.namespace.put(key, bytes, { metadata: { contentType } });
  }
  async get(key: string) {
    const object = await this.namespace.getWithMetadata<{contentType:string}>(key, "stream");
    return object.value
      ? {
          body: object.value,
          contentType: object.metadata?.contentType || "application/octet-stream",
        }
      : null;
  }
  async delete(key: string) { await this.namespace.delete(key); }
}
