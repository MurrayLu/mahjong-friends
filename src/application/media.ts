import { LedgerService } from "./service";
import { ensure } from "../domain/rules";
import type { ImageStorage } from "../storage/images";
import { inspectImage, type ImagePurpose } from "../storage/validation";
import { mediaLog, storageError } from "../storage/errors";

export interface MediaImage {
  Id: string;
  OwnerUserId: string;
  Purpose: ImagePurpose;
  GroupId: string | null;
  HighlightId: string | null;
  StorageKey: string;
  MimeType: string;
  Width: number;
  Height: number;
  ByteSize: number;
  CreatedAt: string;
  DeletedAt: string | null;
}
export class MediaService {
  constructor(
    private ledger: LedgerService,
    private storage: ImageStorage,
  ) {}
  private get repo() {
    return this.ledger.repo;
  }
  view(row: MediaImage) {
    const { StorageKey, DeletedAt, ...metadata } = row;
    return {
      ...metadata,
      ImageUrl: row.GroupId
        ? `/images/${row.GroupId}/${row.Id}`
        : `/api/media/${row.Id}`,
    };
  }
  async avatar(userId: string) {
    const row = await this.repo.one<MediaImage>(
      "SELECT m.* FROM MediaImage m JOIN UserAccount u ON u.Id=m.OwnerUserId AND u.AvatarImageUrl='/api/media/'||m.Id WHERE m.OwnerUserId=? AND m.Purpose='Avatar' AND m.GroupId IS NULL AND m.DeletedAt IS NULL ORDER BY m.CreatedAt DESC LIMIT 1",
      userId,
    );
    return row ? this.view(row) : null;
  }
  async upload(
    userId: string,
    purpose: ImagePurpose,
    bytes: ArrayBuffer,
    mime: string,
    groupId: string | null = null,
    highlightId: string | null = null,
  ) {
    await this.ledger.user(userId);
    if (purpose === "Highlight") {
      ensure(groupId, "IMAGE_FORBIDDEN", 403);
      await this.ledger.requireRoomWrite(userId, groupId);
      if (highlightId) {
        const h = await this.ledger.scopedHighlight(userId, highlightId, true);
        ensure(h.GroupId === groupId, "IMAGE_FORBIDDEN", 403);
        ensure(
          (await this.list(userId, highlightId)).length < 4,
          "IMAGE_LIMIT_REACHED",
          409,
        );
      }
    }
    const fields = inspectImage(bytes, mime, purpose),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    const row: MediaImage = {
      Id: id,
      OwnerUserId: userId,
      Purpose: purpose,
      GroupId: groupId,
      HighlightId: highlightId,
      StorageKey: `${purpose === "Avatar" ? "avatar" : "highlight"}/${userId}/${id}`,
      ...fields,
      CreatedAt: now,
      DeletedAt: null,
    };
    const previous =
      purpose === "Avatar" && !groupId
        ? await this.repo.one<MediaImage>(
            "SELECT * FROM MediaImage WHERE OwnerUserId=? AND Purpose='Avatar' AND GroupId IS NULL AND DeletedAt IS NULL",
            userId,
          )
        : null;
    try {
      await this.storage.put(row.StorageKey, bytes, row.MimeType);
    } catch (error) {
      mediaLog("put", purpose, bytes.byteLength, error);
      throw storageError(error);
    }
    try {
      const statements = [];
      const archivedReference = previous
        ? await this.repo.one(
            "SELECT 1 FROM Player WHERE UserId IS NULL AND AvatarImageUrl LIKE '%/'||? LIMIT 1",
            previous.Id,
          )
        : null;
      if (previous && !archivedReference)
        statements.push(
          this.repo.statement(
            "UPDATE MediaImage SET DeletedAt=? WHERE Id=?",
            now,
            previous.Id,
          ),
        );
      statements.push(
        this.repo.statement(
          "INSERT INTO MediaImage (Id,OwnerUserId,Purpose,GroupId,HighlightId,StorageKey,MimeType,Width,Height,ByteSize,CreatedAt,DeletedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)",
          id,
          userId,
          purpose,
          groupId,
          highlightId,
          row.StorageKey,
          row.MimeType,
          row.Width,
          row.Height,
          row.ByteSize,
          now,
        ),
      );
      if (purpose === "Avatar" && !groupId)
        statements.push(
          this.repo.statement(
            "UPDATE UserAccount SET AvatarImageUrl=?,UpdatedAt=? WHERE Id=?",
            `/api/media/${id}`,
            now,
            userId,
          ),
        );
      if (highlightId)
        statements.push(
          this.repo.statement(
            "UPDATE Highlight SET ImageUrl=coalesce(ImageUrl,?),UpdatedAt=? WHERE Id=?",
            this.view(row).ImageUrl,
            now,
            highlightId,
          ),
        );
      await this.repo.batch(statements);
    } catch (error) {
      try {
        await this.storage.delete(row.StorageKey);
      } catch (cleanupError) {
        mediaLog(
          "compensate-put",
          purpose,
          row.ByteSize,
          cleanupError,
          row.StorageKey,
        );
      }
      mediaLog("metadata-write", purpose, row.ByteSize, error);
      throw storageError(error);
    }
    if (previous) await this.cleanup(previous);
    return this.view(row);
  }
  private async cleanup(row: MediaImage) {
    try {
      await this.storage.delete(row.StorageKey);
      await this.repo.run(
        "DELETE FROM MediaImage WHERE Id=? AND DeletedAt IS NOT NULL",
        row.Id,
      );
    } catch (error) {
      mediaLog("cleanup", row.Purpose, row.ByteSize, error, row.StorageKey);
    }
  }
  async read(userId: string, id: string, groupId?: string) {
    const row = await this.repo.one<MediaImage>(
      "SELECT * FROM MediaImage WHERE Id=? AND DeletedAt IS NULL",
      id,
    );
    ensure(row, "IMAGE_NOT_FOUND", 404);
    const archivedSnapshot = groupId
      ? await this.repo.one(
          "SELECT 1 FROM Player WHERE GroupId=? AND UserId IS NULL AND AvatarImageUrl=? LIMIT 1",
          groupId,
          `/images/${groupId}/${row.Id}`,
        )
      : null;
    if (groupId) {
      if (row.Purpose === "Avatar") {
        await this.ledger.member(userId, groupId);
        ensure(
          archivedSnapshot ||
            (await this.repo.one(
              "SELECT 1 FROM Player WHERE UserId=? AND GroupId=?",
              row.OwnerUserId,
              groupId,
            )),
          "IMAGE_NOT_FOUND",
          404,
        );
      } else
        ensure(
          row.GroupId === groupId || archivedSnapshot,
          "IMAGE_NOT_FOUND",
          404,
        );
    }
    if (row.GroupId) {
      if (archivedSnapshot) await this.ledger.member(userId, groupId!);
      else {
        const globalAvatar = await this.repo.one<{ Id: string }>(
          "SELECT Id FROM UserAccount WHERE AvatarImageUrl=? LIMIT 1",
          `/images/${row.GroupId}/${row.Id}`,
        );
        if (globalAvatar)
          ensure(
            await this.repo.one(
              "SELECT 1 FROM GroupMember a JOIN GroupMember b ON b.GroupId=a.GroupId WHERE a.UserId=? AND b.UserId=? LIMIT 1",
              userId,
              globalAvatar.Id,
            ),
            "IMAGE_FORBIDDEN",
            403,
          );
        else await this.ledger.member(userId, row.GroupId);
      }
    } else if (!archivedSnapshot && row.OwnerUserId !== userId) {
      ensure(
        await this.repo.one(
          "SELECT 1 FROM GroupMember a JOIN GroupMember b ON b.GroupId=a.GroupId WHERE a.UserId=? AND b.UserId=? LIMIT 1",
          userId,
          row.OwnerUserId,
        ),
        "IMAGE_FORBIDDEN",
        403,
      );
    }
    let object;
    try {
      object = await this.storage.get(row.StorageKey);
    } catch (error) {
      throw storageError(error);
    }
    // KV is eventually consistent: a new object can briefly be unavailable in another region.
    ensure(object, "IMAGE_NOT_FOUND", 404);
    return { object, row };
  }
  async list(userId: string, highlightId: string) {
    await this.ledger.scopedHighlight(userId, highlightId);
    return (
      await this.repo.many<MediaImage>(
        "SELECT * FROM MediaImage WHERE HighlightId=? AND DeletedAt IS NULL ORDER BY CreatedAt,Id",
        highlightId,
      )
    ).map((x) => this.view(x));
  }
  async link(userId: string, highlightId: string, url: string | null) {
    if (!url) return;
    const h = await this.ledger.scopedHighlight(userId, highlightId, true),
      id = url.split("/").pop()!;
    const row = await this.repo.one<MediaImage>(
      "SELECT * FROM MediaImage WHERE Id=? AND DeletedAt IS NULL",
      id,
    );
    // Preserve Foundation's legacy internal URL DTO contract. Only managed images are linked.
    if (!row) return;
    ensure(
      row &&
        row.Purpose === "Highlight" &&
        row.GroupId === h.GroupId &&
        row.OwnerUserId === userId,
      "IMAGE_FORBIDDEN",
      403,
    );
    ensure(
      !row.HighlightId || row.HighlightId === highlightId,
      "IMAGE_FORBIDDEN",
      403,
    );
    await this.repo.run(
      "UPDATE MediaImage SET HighlightId=? WHERE Id=?",
      highlightId,
      id,
    );
  }
  async validateLink(userId: string, groupId: string, url: unknown) {
    await this.ledger.requireRoomWrite(userId, groupId);
    if (!url) return;
    ensure(typeof url === "string", "IMAGE_FORBIDDEN", 403);
    // Run the existing URL/scope validation first; it also covers legacy URLs.
    const { internalImage } = await import("../domain/rules");
    internalImage(url, groupId);
    const row = await this.repo.one<MediaImage>(
      "SELECT * FROM MediaImage WHERE Id=? AND DeletedAt IS NULL",
      url.split("/").pop(),
    );
    if (!row) return;
    ensure(
      row &&
        row.GroupId === groupId &&
        row.OwnerUserId === userId &&
        row.Purpose === "Highlight",
      "IMAGE_FORBIDDEN",
      403,
    );
  }
  async remove(userId: string, id: string) {
    const row = await this.repo.one<MediaImage>(
      "SELECT * FROM MediaImage WHERE Id=? AND DeletedAt IS NULL",
      id,
    );
    ensure(row, "IMAGE_NOT_FOUND", 404);
    if (row.Purpose === "Avatar")
      ensure(row.OwnerUserId === userId, "IMAGE_FORBIDDEN", 403);
    else {
      ensure(row.GroupId, "IMAGE_FORBIDDEN", 403);
      await this.ledger.requireRoomWrite(userId, row.GroupId);
      if (row.HighlightId)
        await this.ledger.scopedHighlight(userId, row.HighlightId, true);
      else
        ensure(
          row.OwnerUserId === userId ||
            (await this.ledger.isRoomAdmin(userId, row.GroupId)),
          "IMAGE_FORBIDDEN",
          403,
        );
    }
    const url = this.view(row).ImageUrl,
      now = new Date().toISOString();
    if (
      row.Purpose === "Avatar" &&
      (await this.repo.one(
        "SELECT 1 FROM Player WHERE UserId IS NULL AND AvatarImageUrl LIKE '%/'||? LIMIT 1",
        row.Id,
      ))
    ) {
      await this.repo.run(
        "UPDATE UserAccount SET AvatarImageUrl=NULL,UpdatedAt=? WHERE Id=? AND AvatarImageUrl=?",
        now,
        userId,
        url,
      );
      return;
    }
    if (row.Purpose !== "Avatar") {
      const references = await this.repo.many<import("../domain/model").Player>(
        "SELECT * FROM Player WHERE AvatarImageUrl=?",
        url,
      );
      for (const player of references)
        await this.ledger.requirePlayerWrite(userId, player);
    }
    // First retire metadata and clear references atomically. A failed KV delete remains retryable.
    const statements = [
      this.repo.statement(
        "UPDATE MediaImage SET DeletedAt=? WHERE Id=?",
        now,
        id,
      ),
      this.repo.statement(
        "UPDATE Player SET AvatarImageUrl=NULL,UpdatedAt=? WHERE AvatarImageUrl=?",
        now,
        url,
      ),
      this.repo.statement(
        "UPDATE UserAccount SET AvatarImageUrl=NULL,UpdatedAt=? WHERE AvatarImageUrl=?",
        now,
        url,
      ),
    ];
    if (row.HighlightId) {
      // A photo-only highlight still needs content after its last photo is deleted; delete that
      // aggregate through the existing delete endpoint instead of inventing placeholder content.
      const next = await this.repo.one<MediaImage>(
        "SELECT * FROM MediaImage WHERE HighlightId=? AND Id!=? AND DeletedAt IS NULL ORDER BY CreatedAt,Id LIMIT 1",
        row.HighlightId,
        id,
      );
      const h = await this.ledger.scopedHighlight(userId, row.HighlightId);
      ensure(
        next || h.Title || h.Note || h.Amount !== null,
        "HighlightRequiresContent",
      );
      statements.push(
        this.repo.statement(
          "UPDATE Highlight SET ImageUrl=?,UpdatedAt=? WHERE Id=? AND ImageUrl=?",
          next ? this.view(next).ImageUrl : null,
          now,
          row.HighlightId,
          url,
        ),
      );
    }
    await this.repo.batch(statements);
    await this.cleanup(row);
  }
  async removeAvatar(userId: string) {
    const row = await this.avatar(userId);
    if (row) await this.remove(userId, row.Id);
    await this.repo.run(
      "UPDATE UserAccount SET AvatarImageUrl=NULL,UpdatedAt=? WHERE Id=?",
      new Date().toISOString(),
      userId,
    );
  }
  async deleteHighlight(userId: string, id: string) {
    await this.ledger.scopedHighlight(userId, id, true);
    const rows = await this.repo.many<MediaImage>(
      "SELECT * FROM MediaImage WHERE HighlightId=?",
      id,
    );
    await this.repo.batch([
      this.repo.statement(
        "UPDATE MediaImage SET HighlightId=NULL,DeletedAt=? WHERE HighlightId=?",
        new Date().toISOString(),
        id,
      ),
      this.repo.statement("DELETE FROM Highlight WHERE Id=?", id),
    ]);
    for (const row of rows) await this.cleanup(row);
  }
  async deleteGroup(userId: string, groupId: string, confirmationName: string) {
    const rows = await this.ledger.deleteGroup(
      userId,
      groupId,
      confirmationName,
    );
    // Database authority is gone before best-effort object cleanup. Failed deletes
    // use the existing orphan-key logging; removed images are no longer readable.
    for (const row of rows) await this.cleanup(row);
  }
  async cleanupRetired() {
    for (const row of await this.repo.many<MediaImage>(
      "SELECT * FROM MediaImage WHERE DeletedAt IS NOT NULL LIMIT 100",
    ))
      await this.cleanup(row);
  }
}
