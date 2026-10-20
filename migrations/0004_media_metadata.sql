CREATE TABLE MediaImage (
 Id TEXT PRIMARY KEY,
 OwnerUserId TEXT NOT NULL REFERENCES UserAccount(Id),
 Purpose TEXT NOT NULL CHECK(Purpose IN ('Avatar','Highlight')),
 GroupId TEXT REFERENCES "Group"(Id),
 HighlightId TEXT REFERENCES Highlight(Id),
 StorageKey TEXT NOT NULL UNIQUE,
 MimeType TEXT NOT NULL CHECK(MimeType IN ('image/webp','image/jpeg','image/png')),
 Width INTEGER NOT NULL CHECK(typeof(Width)='integer' AND Width > 0),
 Height INTEGER NOT NULL CHECK(typeof(Height)='integer' AND Height > 0),
 ByteSize INTEGER NOT NULL CHECK(typeof(ByteSize)='integer' AND ByteSize BETWEEN 1 AND 512000),
 CreatedAt TEXT NOT NULL,
 DeletedAt TEXT,
 CHECK((Purpose='Avatar' AND GroupId IS NULL AND HighlightId IS NULL AND Width=Height AND Width<=512)
 OR (Purpose='Highlight' AND GroupId IS NOT NULL AND Width<=1600 AND Height<=1600))
);
CREATE INDEX MediaImage_Owner ON MediaImage(OwnerUserId);
CREATE INDEX MediaImage_Purpose ON MediaImage(Purpose);
CREATE INDEX MediaImage_Highlight ON MediaImage(HighlightId,DeletedAt);
CREATE UNIQUE INDEX MediaImage_ActiveAvatar ON MediaImage(OwnerUserId) WHERE Purpose='Avatar' AND DeletedAt IS NULL;
CREATE TRIGGER MediaImage_HighlightLimit_Insert BEFORE INSERT ON MediaImage
 WHEN NEW.HighlightId IS NOT NULL AND NEW.DeletedAt IS NULL
 AND (SELECT COUNT(*) FROM MediaImage WHERE HighlightId=NEW.HighlightId AND DeletedAt IS NULL)>=4
 BEGIN SELECT RAISE(ABORT,'IMAGE_LIMIT_REACHED'); END;
CREATE TRIGGER MediaImage_HighlightLimit_Update BEFORE UPDATE OF HighlightId,DeletedAt ON MediaImage
 WHEN NEW.HighlightId IS NOT NULL AND NEW.DeletedAt IS NULL
 AND (SELECT COUNT(*) FROM MediaImage WHERE HighlightId=NEW.HighlightId AND DeletedAt IS NULL AND Id!=NEW.Id)>=4
 BEGIN SELECT RAISE(ABORT,'IMAGE_LIMIT_REACHED'); END;
CREATE TRIGGER MediaImage_HighlightScope_Insert BEFORE INSERT ON MediaImage
 WHEN NEW.HighlightId IS NOT NULL AND NEW.GroupId !=
 (SELECT d.GroupId FROM Highlight h JOIN DayRecord d ON d.Id=h.DayRecordId WHERE h.Id=NEW.HighlightId)
 BEGIN SELECT RAISE(ABORT,'IMAGE_FORBIDDEN'); END;
CREATE TRIGGER MediaImage_HighlightScope_Update BEFORE UPDATE OF HighlightId,GroupId ON MediaImage
 WHEN NEW.HighlightId IS NOT NULL AND NEW.GroupId !=
 (SELECT d.GroupId FROM Highlight h JOIN DayRecord d ON d.Id=h.DayRecordId WHERE h.Id=NEW.HighlightId)
 BEGIN SELECT RAISE(ABORT,'IMAGE_FORBIDDEN'); END;
