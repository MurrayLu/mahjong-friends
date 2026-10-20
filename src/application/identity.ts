import { Repository } from "../persistence/repository";
import { LedgerService } from "./service";
import { ensure, text, DomainError } from "../domain/rules";
import type { UserAccount } from "../domain/model";
export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  displayName: string;
}
export class IdentityService {
  constructor(public repo: Repository) {}
  async createAnonymous(
    sessionHash: string,
    expiresAt: string,
    displayName: unknown = "玩家",
  ) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString(),
      name = text(displayName, "DisplayName");
    await this.repo.batch([
      this.repo.statement(
        "INSERT INTO UserAccount (Id,GoogleSubjectId,Email,DisplayName,CreatedAt,UpdatedAt) VALUES (?,NULL,NULL,?,?,?)",
        id,
        name,
        now,
        now,
      ),
      this.repo.statement(
        "INSERT INTO AuthSession (TokenHash,UserId,ExpiresAt) VALUES (?,?,?)",
        sessionHash,
        id,
        expiresAt,
      ),
    ]);
    return new LedgerService(this.repo).user(id);
  }
  async hasMeaningfulData(userId: string) {
    const checks = [
      ['"Group"', "OwnerUserId"],
      ["GroupMember", "UserId"],
      ["Player", "UserId"],
      ["Session", "CreatedByUserId"],
      ["Session", "UpdatedByUserId"],
      ["Highlight", "CreatedByUserId"],
      ["MediaImage", "OwnerUserId"],
    ];
    const row = await this.repo.one<{ HasData: number }>(
      "SELECT " +
        checks
          .map(
            ([table, column]) =>
              `EXISTS(SELECT 1 FROM ${table} WHERE ${column}=?)`,
          )
          .join(" OR ") +
        " AS HasData",
      ...checks.map(() => userId),
    );
    return !!row?.HasData;
  }
  /** Accept only the identity verified by the OAuth adapter. Never expose this as a userId command. */
  async connectGoogle(
    initiatingUserId: string | null,
    identity: VerifiedGoogleIdentity,
  ): Promise<UserAccount> {
    ensure(
      typeof identity.subject === "string" &&
        identity.subject.trim().length > 0 &&
        identity.subject.length <= 1000 &&
        typeof identity.email === "string" &&
        identity.email.trim().length > 0 &&
        identity.email.length <= 1000,
      "InvalidGoogleIdentity",
      401,
    );
    const ledger = new LedgerService(this.repo),
      now = new Date().toISOString();
    const current = initiatingUserId
      ? await ledger.user(initiatingUserId)
      : null;
    const existing = await this.repo.one<UserAccount>(
      "SELECT * FROM UserAccount WHERE GoogleSubjectId=?",
      identity.subject,
    );
    if (current?.GoogleSubjectId) {
      ensure(
        current.GoogleSubjectId === identity.subject,
        "AccountAlreadyLinked",
        409,
      );
      await this.repo.run(
        "UPDATE UserAccount SET Email=?,UpdatedAt=? WHERE Id=? AND GoogleSubjectId=?",
        identity.email,
        now,
        current.Id,
        identity.subject,
      );
      return ledger.user(current.Id);
    }
    if (current && existing && existing.Id !== current.Id) {
      ensure(
        !(await this.hasMeaningfulData(current.Id)),
        "GoogleAccountMergeRequired",
        409,
      );
      try {
        await this.repo.batch([
          // A concurrent in-place link must fail the entire batch instead of retiring a newly linked user.
          this.repo.statement(
            "UPDATE UserAccount SET DisplayName=CASE WHEN GoogleSubjectId IS NULL THEN DisplayName ELSE NULL END WHERE Id=?",
            current.Id,
          ),
          this.repo.statement(
            "DELETE FROM OAuthState WHERE InitiatingUserId=?",
            current.Id,
          ),
          this.repo.statement(
            "DELETE FROM AuthSession WHERE UserId=?",
            current.Id,
          ),
          this.repo.statement(
            "DELETE FROM UserAccount WHERE Id=? AND GoogleSubjectId IS NULL",
            current.Id,
          ),
          this.repo.statement(
            "UPDATE UserAccount SET Email=?,UpdatedAt=? WHERE Id=?",
            identity.email,
            now,
            existing.Id,
          ),
        ]);
      } catch (error) {
        if (/FOREIGN KEY/i.test(String(error)))
          throw new DomainError("GoogleAccountMergeRequired", 409);
        if (/NOT NULL/i.test(String(error)))
          throw new DomainError("AccountAlreadyLinked", 409);
        throw error;
      }
      return ledger.user(existing.Id);
    }
    if (current) {
      try {
        await this.repo.batch([
          this.repo.statement(
            "UPDATE UserAccount SET DisplayName=CASE WHEN GoogleSubjectId IS NULL OR GoogleSubjectId=? THEN DisplayName ELSE NULL END WHERE Id=?",
            identity.subject,
            current.Id,
          ),
          this.repo.statement(
            "UPDATE UserAccount SET GoogleSubjectId=?,Email=?,UpdatedAt=?,GoogleLinkedAt=COALESCE(GoogleLinkedAt,?) WHERE Id=?",
            identity.subject,
            identity.email,
            now,
            now,
            current.Id,
          ),
        ]);
      } catch (error) {
        if (/UNIQUE/i.test(String(error)))
          throw new DomainError("GoogleAccountMergeRequired", 409);
        if (/NOT NULL/i.test(String(error)))
          throw new DomainError("AccountAlreadyLinked", 409);
        throw error;
      }
      return ledger.user(current.Id);
    }
    const linked = await ledger.upsertGoogleUser(
      identity.subject,
      identity.email,
      identity.displayName,
    );
    // Only a genuinely new Google identity has a known link time. A legacy login
    // must not manufacture a historical registration date.
    if (!existing)
      await this.repo.run(
        "UPDATE UserAccount SET GoogleLinkedAt=? WHERE Id=? AND GoogleLinkedAt IS NULL",
        now,
        linked.Id,
      );
    return ledger.user(linked.Id);
  }
}
