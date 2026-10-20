CREATE TABLE GroupAdmin (
 GroupId TEXT NOT NULL REFERENCES "Group"(Id) ON DELETE CASCADE,
 UserId TEXT NOT NULL REFERENCES UserAccount(Id),
 CreatedAt TEXT NOT NULL,
 AppointedByUserId TEXT NULL REFERENCES UserAccount(Id) ON DELETE SET NULL,
 PRIMARY KEY(GroupId,UserId)
);
ALTER TABLE Player ADD COLUMN IsArchived INTEGER NOT NULL DEFAULT 0 CHECK(IsArchived IN (0,1));
-- Repair a legacy creator membership before seeding its admin role.
INSERT INTO GroupMember(GroupId,UserId,JoinedAt,AccessLevel)
 SELECT Id,OwnerUserId,CreatedAt,'Member' FROM "Group" WHERE 1
 ON CONFLICT(GroupId,UserId) DO UPDATE SET AccessLevel='Member';
INSERT INTO GroupAdmin(GroupId,UserId,CreatedAt,AppointedByUserId)
 SELECT Id,OwnerUserId,CreatedAt,NULL FROM "Group";
-- Enforce the invariant inside the same SQLite transaction, including concurrent
-- demote/remove/unclaim batches. Parent deletion may cascade for fixture cleanup.
CREATE TRIGGER GroupAdmin_LastRequired BEFORE DELETE ON GroupAdmin
 WHEN EXISTS(SELECT 1 FROM "Group" WHERE Id=OLD.GroupId)
 AND (SELECT COUNT(*) FROM GroupAdmin WHERE GroupId=OLD.GroupId)<=1
 BEGIN SELECT RAISE(ABORT,'LastRoomAdminRequired'); END;
