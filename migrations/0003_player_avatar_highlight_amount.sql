ALTER TABLE Player ADD COLUMN AvatarImageUrl TEXT NULL
 CHECK(AvatarImageUrl IS NULL OR (
 substr(AvatarImageUrl,1,length('/images/'||GroupId||'/'))='/images/'||GroupId||'/'
 AND length(AvatarImageUrl)>length('/images/'||GroupId||'/')
 AND substr(AvatarImageUrl,length('/images/'||GroupId||'/')+1) NOT GLOB '*[^A-Za-z0-9_-]*'));

-- SQLite cannot alter the existing Highlight content CHECK. Rebuild the same
-- table, preserving every existing field, row, foreign key, index and scope rule.
DROP TRIGGER Highlight_Scope_Insert;
DROP TRIGGER Highlight_Scope_Update;
CREATE TABLE Highlight_new (
 Id TEXT PRIMARY KEY, DayRecordId TEXT NOT NULL REFERENCES DayRecord(Id), SessionId TEXT REFERENCES Session(Id),
 PlayerId TEXT REFERENCES Player(Id), Title TEXT, Note TEXT, ImageUrl TEXT,
 CreatedByUserId TEXT NOT NULL REFERENCES UserAccount(Id), CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL,
 Amount INTEGER NULL CHECK(Amount IS NULL OR (typeof(Amount)='integer' AND Amount BETWEEN -9007199254740991 AND 9007199254740991)),
 CHECK(length(trim(coalesce(Title,''))) > 0 OR length(trim(coalesce(Note,''))) > 0 OR length(trim(coalesce(ImageUrl,''))) > 0 OR Amount IS NOT NULL)
);
INSERT INTO Highlight_new (Id,DayRecordId,SessionId,PlayerId,Title,Note,ImageUrl,CreatedByUserId,CreatedAt,UpdatedAt)
 SELECT Id,DayRecordId,SessionId,PlayerId,Title,Note,ImageUrl,CreatedByUserId,CreatedAt,UpdatedAt FROM Highlight;
DROP TABLE Highlight;
ALTER TABLE Highlight_new RENAME TO Highlight;
CREATE INDEX Highlight_Day ON Highlight(DayRecordId, CreatedAt);
CREATE TRIGGER Highlight_Scope_Insert BEFORE INSERT ON Highlight
 WHEN (NEW.SessionId IS NOT NULL AND (SELECT DayRecordId FROM Session WHERE Id=NEW.SessionId) != NEW.DayRecordId)
 OR (NEW.PlayerId IS NOT NULL AND (SELECT GroupId FROM Player WHERE Id=NEW.PlayerId) != (SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId))
 BEGIN SELECT RAISE(ABORT, 'HighlightScopeMismatch'); END;
-- Apply internal-image rules to future writes without rewriting legacy metadata.
CREATE TRIGGER Highlight_InternalImage_Insert BEFORE INSERT ON Highlight
 WHEN NEW.ImageUrl IS NOT NULL AND NOT (
 substr(NEW.ImageUrl,1,length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/'))='/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/'
 AND length(NEW.ImageUrl)>length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/')
 AND substr(NEW.ImageUrl,length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/')+1) NOT GLOB '*[^A-Za-z0-9_-]*')
 BEGIN SELECT RAISE(ABORT, 'InvalidInternalImage'); END;
CREATE TRIGGER Highlight_InternalImage_Update BEFORE UPDATE OF ImageUrl,DayRecordId ON Highlight
 WHEN NEW.ImageUrl IS NOT NULL AND NOT (
 substr(NEW.ImageUrl,1,length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/'))='/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/'
 AND length(NEW.ImageUrl)>length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/')
 AND substr(NEW.ImageUrl,length('/images/'||(SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId)||'/')+1) NOT GLOB '*[^A-Za-z0-9_-]*')
 BEGIN SELECT RAISE(ABORT, 'InvalidInternalImage'); END;
CREATE TRIGGER Highlight_Scope_Update BEFORE UPDATE ON Highlight
 WHEN (NEW.SessionId IS NOT NULL AND (SELECT DayRecordId FROM Session WHERE Id=NEW.SessionId) != NEW.DayRecordId)
 OR (NEW.PlayerId IS NOT NULL AND (SELECT GroupId FROM Player WHERE Id=NEW.PlayerId) != (SELECT GroupId FROM DayRecord WHERE Id=NEW.DayRecordId))
 BEGIN SELECT RAISE(ABORT, 'HighlightScopeMismatch'); END;
