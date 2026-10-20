-- Table appeals are separate from historical settlement and session provenance.
CREATE TABLE TableAppeal (
 Id TEXT PRIMARY KEY,
 GroupId TEXT NOT NULL REFERENCES "Group"(Id) ON DELETE CASCADE,
 SourceSessionId TEXT NOT NULL REFERENCES Session(Id),
 CreatedByUserId TEXT NOT NULL REFERENCES UserAccount(Id),
 CreatedAt TEXT NOT NULL,
 ExpiresAt TEXT NOT NULL,
 Status TEXT NOT NULL CHECK(Status IN ('ACTIVE','FINALIZED')),
 ReadyAt TEXT,
 FinalizedAt TEXT,
 FinalResult TEXT CHECK(FinalResult IN ('READY','IGNORED','ONE_SHORT','REJECTED','WATCH_ONLY','MIXED')),
 CHECK ((Status='ACTIVE' AND FinalizedAt IS NULL AND FinalResult IS NULL) OR
        (Status='FINALIZED' AND FinalizedAt IS NOT NULL AND FinalResult IS NOT NULL))
);
CREATE UNIQUE INDEX TableAppeal_OneActive ON TableAppeal(GroupId) WHERE Status='ACTIVE';
CREATE INDEX TableAppeal_Feed ON TableAppeal(GroupId,CreatedAt DESC);
CREATE TABLE TableAppealReaction (
 AppealId TEXT NOT NULL REFERENCES TableAppeal(Id) ON DELETE CASCADE,
 UserAccountId TEXT NOT NULL REFERENCES UserAccount(Id),
 Reaction TEXT NOT NULL CHECK(Reaction IN ('SUPPORT','REJECT','WATCH')),
 CreatedAt TEXT NOT NULL,
 UpdatedAt TEXT NOT NULL,
 PRIMARY KEY(AppealId,UserAccountId)
);

-- Keep the existing feed and read cursor intact while allowing one appeal story.
CREATE TABLE GroupActivityNext (
 Id TEXT PRIMARY KEY, GroupId TEXT NOT NULL REFERENCES "Group"(Id) ON DELETE CASCADE,
 Type TEXT NOT NULL CHECK(Type IN ('PLAYER_ACHIEVEMENT_UNLOCKED','GROUP_ACHIEVEMENT_UNLOCKED','PLAYER_RECORD_BROKEN','ACHIEVEMENT_BACKFILL_SUMMARY','HIGHLIGHT_CREATED','TABLE_APPEAL')),
 ActorUserId TEXT REFERENCES UserAccount(Id) ON DELETE SET NULL,
 PlayerId TEXT REFERENCES Player(Id) ON DELETE SET NULL, AchievementId TEXT,
 SessionId TEXT REFERENCES Session(Id) ON DELETE SET NULL,
 HighlightId TEXT REFERENCES Highlight(Id) ON DELETE SET NULL,
 CreatedAt TEXT NOT NULL, MetadataJson TEXT, InvalidatedAt TEXT,
 AppealId TEXT REFERENCES TableAppeal(Id) ON DELETE SET NULL
);
INSERT INTO GroupActivityNext(Id,GroupId,Type,ActorUserId,PlayerId,AchievementId,SessionId,HighlightId,CreatedAt,MetadataJson,InvalidatedAt)
 SELECT Id,GroupId,Type,ActorUserId,PlayerId,AchievementId,SessionId,HighlightId,CreatedAt,MetadataJson,InvalidatedAt FROM GroupActivity;
DROP TABLE GroupActivity;
ALTER TABLE GroupActivityNext RENAME TO GroupActivity;
CREATE INDEX GroupActivity_Feed ON GroupActivity(GroupId,InvalidatedAt,CreatedAt DESC,Id DESC);
CREATE UNIQUE INDEX GroupActivity_OneAppeal ON GroupActivity(AppealId) WHERE AppealId IS NOT NULL;
