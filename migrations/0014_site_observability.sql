-- Unknown legacy timestamps stay NULL. Never infer Google linking or settlement dates.
ALTER TABLE UserAccount ADD COLUMN GoogleLinkedAt TEXT;
CREATE TABLE GoogleSessionProof (
 TokenHash TEXT PRIMARY KEY REFERENCES AuthSession(TokenHash) ON DELETE CASCADE,
 VerifiedGoogleSubject TEXT NOT NULL, VerifiedGoogleEmail TEXT NOT NULL
);
ALTER TABLE Session ADD COLUMN SettledAt TEXT;
CREATE TABLE SiteObservationStart (
 Id INTEGER PRIMARY KEY CHECK(Id=1), StartedAt TEXT NOT NULL
);
INSERT INTO SiteObservationStart VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- Last successful foreground account load / business mutation per account and UTC day.
CREATE TABLE SiteUserActivity (
 UserId TEXT NOT NULL REFERENCES UserAccount(Id) ON DELETE CASCADE,
 UtcDay TEXT NOT NULL, LastSeenAt TEXT NOT NULL,
 PRIMARY KEY(UserId,UtcDay)
);
CREATE INDEX SiteUserActivity_Time ON SiteUserActivity(LastSeenAt,UserId);
-- Intentionally not an FK to Group: audit survives room deletion.
CREATE TABLE SiteAdminAudit (
 Id TEXT PRIMARY KEY, AdminUserId TEXT NOT NULL, GroupId TEXT NOT NULL,
 ViewedAt TEXT NOT NULL, Outcome TEXT NOT NULL CHECK(Outcome IN ('allowed','not-found','failed'))
);
CREATE INDEX SiteAdminAudit_Time ON SiteAdminAudit(ViewedAt);
CREATE INDEX Group_CreatorCreated ON "Group"(OwnerUserId,CreatedAt);
CREATE INDEX Group_Created ON "Group"(CreatedAt,Id);
CREATE INDEX GroupAdmin_User ON GroupAdmin(UserId,GroupId);
CREATE INDEX UserAccount_Linked ON UserAccount(GoogleLinkedAt);
CREATE INDEX Session_Settled ON Session(SettledAt,DayRecordId);
