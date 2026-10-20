import type { Player, RoomMemberView } from "../domain/model";
import { DomainError, ensure, text } from "../domain/rules";
import { Repository } from "../persistence/repository";

/** Transactional room roles; creator metadata is never used for authorization. */
export class Governance {
  constructor(public repo: Repository) {}
  async requireRoomRead(
    userId: string,
    groupId: string,
  ): Promise<"Member" | "Viewer"> {
    const m = await this.repo.one<{ AccessLevel: "Member" | "Viewer" }>(
      "SELECT AccessLevel FROM GroupMember WHERE GroupId=? AND UserId=?",
      groupId,
      userId,
    );
    ensure(m, "GroupMembershipRequired", 403);
    return m.AccessLevel;
  }
  async requireRoomWrite(userId: string, groupId: string) {
    ensure(
      (await this.requireRoomRead(userId, groupId)) === "Member",
      "GroupWriteAccessRequired",
      403,
    );
  }
  async isRoomAdmin(userId: string, groupId: string) {
    return !!(await this.repo.one(
      `SELECT 1 FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId WHERE a.GroupId=? AND a.UserId=? AND m.AccessLevel='Member'`,
      groupId,
      userId,
    ));
  }
  async requireRoomAdmin(userId: string, groupId: string) {
    await this.requireRoomWrite(userId, groupId);
    ensure(await this.isRoomAdmin(userId, groupId), "RoomAdminRequired", 403);
  }
  async requirePlayerWrite(userId: string, player: Player) {
    await this.requireRoomWrite(userId, player.GroupId);
    ensure(
      (await this.isRoomAdmin(userId, player.GroupId)) ||
        (!player.IsArchived && !player.IsGuest && player.UserId === userId),
      "PlayerWriteAccessRequired",
      403,
    );
  }
  async roomMembers(userId: string, groupId: string) {
    const access = await this.requireRoomRead(userId, groupId);
    return this.repo.many<RoomMemberView>(
      `SELECT m.UserId,m.AccessLevel,EXISTS(SELECT 1 FROM GroupAdmin a WHERE a.GroupId=m.GroupId AND a.UserId=m.UserId) AS IsAdmin,
      p.Id AS PlayerId,CASE WHEN m.AccessLevel='Viewer' AND u.DisplayName='玩家' THEN '幽靈' ELSE u.DisplayName END AS DisplayName,u.AvatarImageUrl,CASE WHEN ?='Member' THEN u.Email ELSE NULL END AS Email
      FROM GroupMember m JOIN UserAccount u ON u.Id=m.UserId LEFT JOIN Player p ON p.GroupId=m.GroupId AND p.UserId=m.UserId AND p.IsArchived=0
      WHERE m.GroupId=? ORDER BY m.JoinedAt,m.UserId`,
      access,
      groupId,
    );
  }
  async renameMember(
    actor: string,
    groupId: string,
    target: string,
    name: string,
  ) {
    await this.requireRoomAdmin(actor, groupId);
    ensure(
      await this.repo.one(
        "SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?",
        groupId,
        target,
      ),
      "GroupMembershipRequired",
      404,
    );
    await this.repo.run(
      "UPDATE UserAccount SET DisplayName=?,UpdatedAt=? WHERE Id=?",
      text(name, "DisplayName"),
      new Date().toISOString(),
      target,
    );
    return { ok: true };
  }
  private async governanceBatch(
    statements: Parameters<Repository["batch"]>[0],
  ) {
    try {
      await this.repo.batch(statements);
    } catch (error) {
      if (String(error).includes("LastRoomAdminRequired"))
        throw new DomainError("LastRoomAdminRequired", 409);
      throw error;
    }
  }
  private actorPredicate = `EXISTS(SELECT 1 FROM GroupAdmin a JOIN GroupMember m ON m.GroupId=a.GroupId AND m.UserId=a.UserId WHERE a.GroupId=? AND a.UserId=? AND m.AccessLevel='Member')`;
  async appointAdmin(actor: string, groupId: string, target: string) {
    await this.requireRoomAdmin(actor, groupId);
    const eligible = `EXISTS(SELECT 1 FROM GroupMember m JOIN Player p ON p.GroupId=m.GroupId AND p.UserId=m.UserId WHERE m.GroupId=? AND m.UserId=? AND m.AccessLevel='Member' AND p.IsGuest=0 AND p.IsArchived=0)`;
    ensure(
      await this.repo.one(`SELECT 1 WHERE ${eligible}`, groupId, target),
      "AdminRequiresActiveMember",
      409,
    );
    await this.repo.run(
      `INSERT INTO GroupAdmin(GroupId,UserId,CreatedAt,AppointedByUserId) SELECT ?,?,?,? WHERE ${this.actorPredicate} AND ${eligible} ON CONFLICT(GroupId,UserId) DO NOTHING`,
      groupId,
      target,
      new Date().toISOString(),
      actor,
      groupId,
      actor,
      groupId,
      target,
    );
    ensure(await this.isRoomAdmin(target, groupId), "RoomAdminRequired", 403);
  }
  async demoteAdmin(actor: string, groupId: string, target: string) {
    await this.requireRoomAdmin(actor, groupId);
    await this.governanceBatch([
      this.repo.statement(
        `DELETE FROM GroupAdmin WHERE GroupId=? AND UserId=? AND ${this.actorPredicate}`,
        groupId,
        target,
        groupId,
        actor,
      ),
    ]);
    if (await this.isRoomAdmin(target, groupId))
      await this.requireRoomAdmin(actor, groupId);
  }
  async removeMember(actor: string, groupId: string, target: string) {
    await this.requireRoomAdmin(actor, groupId);
    ensure(
      await this.repo.one(
        "SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?",
        groupId,
        target,
      ),
      "MemberNotFound",
      404,
    );
    // Recheck the acting role in each batch statement. The last-admin trigger
    // aborts and rolls back every history/binding/membership change together.
    await this.governanceBatch([
      this.repo.statement(
        `UPDATE Player SET DisplayName=(SELECT DisplayName FROM UserAccount WHERE Id=Player.UserId),AvatarImageUrl=(SELECT '/images/'||Player.GroupId||'/'||m.Id FROM MediaImage m JOIN UserAccount u ON u.Id=Player.UserId WHERE u.AvatarImageUrl='/api/media/'||m.Id OR u.AvatarImageUrl='/images/'||m.GroupId||'/'||m.Id LIMIT 1),UserId=NULL,IsGuest=1,IsArchived=1,UpdatedAt=? WHERE GroupId=? AND UserId=? AND ${this.actorPredicate}`,
        new Date().toISOString(),
        groupId,
        target,
        groupId,
        actor,
      ),
      this.repo.statement(
        `DELETE FROM GroupMember WHERE GroupId=? AND UserId=? AND ${this.actorPredicate}`,
        groupId,
        target,
        groupId,
        actor,
      ),
      this.repo.statement(
        `DELETE FROM GroupAdmin WHERE GroupId=? AND UserId=? AND (${this.actorPredicate} OR (UserId=? AND NOT EXISTS(SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?)))`,
        groupId,
        target,
        groupId,
        actor,
        actor,
        groupId,
        actor,
      ),
    ]);
    ensure(
      !(await this.repo.one(
        "SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=?",
        groupId,
        target,
      )),
      "RoomAdminRequired",
      403,
    );
  }
  async selfUnclaim(userId: string, groupId: string) {
    await this.requireRoomWrite(userId, groupId);
    ensure(
      await this.repo.one(
        "SELECT 1 FROM Player WHERE GroupId=? AND UserId=? AND IsArchived=0",
        groupId,
        userId,
      ),
      "PlayerClaimUnavailable",
      409,
    );
    await this.governanceBatch([
      this.repo.statement(
        `UPDATE Player SET DisplayName=(SELECT DisplayName FROM UserAccount WHERE Id=Player.UserId),AvatarImageUrl=(SELECT '/images/'||Player.GroupId||'/'||m.Id FROM MediaImage m JOIN UserAccount u ON u.Id=Player.UserId WHERE u.AvatarImageUrl='/api/media/'||m.Id OR u.AvatarImageUrl='/images/'||m.GroupId||'/'||m.Id LIMIT 1),UserId=NULL,IsGuest=1,IsArchived=0,UpdatedAt=? WHERE GroupId=? AND UserId=? AND EXISTS(SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=? AND AccessLevel='Member')`,
        new Date().toISOString(),
        groupId,
        userId,
        groupId,
        userId,
      ),
      this.repo.statement(
        "UPDATE GroupMember SET AccessLevel='Viewer' WHERE GroupId=? AND UserId=? AND AccessLevel='Member'",
        groupId,
        userId,
      ),
      this.repo.statement(
        "DELETE FROM GroupAdmin WHERE GroupId=? AND UserId=? AND EXISTS(SELECT 1 FROM GroupMember WHERE GroupId=? AND UserId=? AND AccessLevel='Viewer')",
        groupId,
        userId,
        groupId,
        userId,
      ),
    ]);
    ensure(
      (await this.requireRoomRead(userId, groupId)) === "Viewer",
      "GroupWriteAccessRequired",
      403,
    );
  }
}
