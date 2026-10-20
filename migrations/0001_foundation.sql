PRAGMA foreign_keys = ON;
CREATE TABLE UserAccount (
 Id TEXT PRIMARY KEY, GoogleSubjectId TEXT NOT NULL UNIQUE, Email TEXT NOT NULL,
 DisplayName TEXT NOT NULL CHECK(length(trim(DisplayName)) > 0), CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL
);
CREATE TABLE "Group" (
 Id TEXT PRIMARY KEY, Name TEXT NOT NULL CHECK(length(trim(Name)) > 0), OwnerUserId TEXT NOT NULL REFERENCES UserAccount(Id),
 InviteCode TEXT NOT NULL UNIQUE, CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL
);
CREATE TABLE GroupMember (
 GroupId TEXT NOT NULL REFERENCES "Group"(Id), UserId TEXT NOT NULL REFERENCES UserAccount(Id), JoinedAt TEXT NOT NULL,
 PRIMARY KEY(GroupId, UserId)
);
CREATE TABLE Player (
 Id TEXT PRIMARY KEY, GroupId TEXT NOT NULL REFERENCES "Group"(Id), UserId TEXT REFERENCES UserAccount(Id),
 DisplayName TEXT NOT NULL CHECK(length(trim(DisplayName)) > 0), IsGuest INTEGER NOT NULL CHECK(IsGuest IN (0,1)),
 CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL,
 CHECK((UserId IS NULL AND IsGuest = 1) OR (UserId IS NOT NULL AND IsGuest = 0)), UNIQUE(Id, GroupId)
);
CREATE UNIQUE INDEX Player_OfficialIdentity ON Player(GroupId, UserId) WHERE UserId IS NOT NULL;
CREATE TABLE DayRecord (
 Id TEXT PRIMARY KEY, GroupId TEXT NOT NULL REFERENCES "Group"(Id), RecordDate TEXT NOT NULL,
 CreatedAt TEXT NOT NULL, UNIQUE(GroupId, RecordDate), UNIQUE(Id, GroupId)
);
CREATE TABLE Session (
 Id TEXT PRIMARY KEY, DayRecordId TEXT NOT NULL REFERENCES DayRecord(Id), Name TEXT NOT NULL,
 MahjongType TEXT NOT NULL CHECK(MahjongType IN ('Traditional','American','Mixed')),
 RateMajor INTEGER NOT NULL CHECK(typeof(RateMajor) = 'integer' AND RateMajor >= 0),
 RateMinor INTEGER NOT NULL CHECK(typeof(RateMinor) = 'integer' AND RateMinor >= 0),
 CreatedByUserId TEXT NOT NULL REFERENCES UserAccount(Id), CreatedAt TEXT NOT NULL,
 UpdatedByUserId TEXT NOT NULL REFERENCES UserAccount(Id), UpdatedAt TEXT NOT NULL
);
CREATE INDEX Session_Day ON Session(DayRecordId, CreatedAt);
CREATE TABLE SessionResult (
 SessionId TEXT NOT NULL REFERENCES Session(Id), PlayerId TEXT NOT NULL REFERENCES Player(Id),
 NetAmount INTEGER NOT NULL CHECK(typeof(NetAmount) = 'integer' AND NetAmount BETWEEN -9007199254740991 AND 9007199254740991),
 PRIMARY KEY(SessionId, PlayerId)
);
CREATE INDEX SessionResult_Player ON SessionResult(PlayerId);
CREATE TRIGGER SessionResult_SameGroup_Insert BEFORE INSERT ON SessionResult
 WHEN (SELECT GroupId FROM Player WHERE Id = NEW.PlayerId) !=
 (SELECT d.GroupId FROM Session s JOIN DayRecord d ON d.Id = s.DayRecordId WHERE s.Id = NEW.SessionId)
 BEGIN SELECT RAISE(ABORT, 'CrossGroupPlayer'); END;
CREATE TRIGGER SessionResult_SameGroup_Update BEFORE UPDATE ON SessionResult
 WHEN (SELECT GroupId FROM Player WHERE Id = NEW.PlayerId) !=
 (SELECT d.GroupId FROM Session s JOIN DayRecord d ON d.Id = s.DayRecordId WHERE s.Id = NEW.SessionId)
 BEGIN SELECT RAISE(ABORT, 'CrossGroupPlayer'); END;
CREATE TABLE Highlight (
 Id TEXT PRIMARY KEY, DayRecordId TEXT NOT NULL REFERENCES DayRecord(Id), SessionId TEXT REFERENCES Session(Id),
 PlayerId TEXT REFERENCES Player(Id), Title TEXT, Note TEXT, ImageUrl TEXT,
 CreatedByUserId TEXT NOT NULL REFERENCES UserAccount(Id), CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL,
 CHECK(length(trim(coalesce(Title,''))) > 0 OR length(trim(coalesce(Note,''))) > 0 OR length(trim(coalesce(ImageUrl,''))) > 0)
);
CREATE INDEX Highlight_Day ON Highlight(DayRecordId, CreatedAt);
CREATE TRIGGER Highlight_Scope_Insert BEFORE INSERT ON Highlight
 WHEN (NEW.SessionId IS NOT NULL AND (SELECT DayRecordId FROM Session WHERE Id=NEW.SessionId) != NEW.DayRecordId)
 OR (NEW.PlayerId IS NOT NULL AND (SELECT GroupId FROM Player WHERE Id=NEW.PlayerId) != (SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId))
 BEGIN SELECT RAISE(ABORT, 'HighlightScopeMismatch'); END;
CREATE TRIGGER Highlight_Scope_Update BEFORE UPDATE ON Highlight
 WHEN (NEW.SessionId IS NOT NULL AND (SELECT DayRecordId FROM Session WHERE Id=NEW.SessionId) != NEW.DayRecordId)
 OR (NEW.PlayerId IS NOT NULL AND (SELECT GroupId FROM Player WHERE Id=NEW.PlayerId) != (SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId))
 BEGIN SELECT RAISE(ABORT, 'HighlightScopeMismatch'); END;
CREATE TABLE AuthSession (TokenHash TEXT PRIMARY KEY, UserId TEXT NOT NULL REFERENCES UserAccount(Id), ExpiresAt TEXT NOT NULL);
CREATE TABLE OAuthState (StateHash TEXT PRIMARY KEY, Verifier TEXT NOT NULL, Nonce TEXT NOT NULL, ReturnTo TEXT NOT NULL, ExpiresAt TEXT NOT NULL);
