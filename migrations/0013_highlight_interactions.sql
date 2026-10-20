CREATE TABLE HighlightReaction (
  HighlightId TEXT NOT NULL REFERENCES Highlight(Id) ON DELETE CASCADE,
  UserId TEXT NOT NULL REFERENCES UserAccount(Id),
  Reaction TEXT NOT NULL CHECK (Reaction IN ('LIKE','DISLIKE')),
  CreatedAt TEXT NOT NULL,
  PRIMARY KEY (HighlightId, UserId)
);
CREATE TABLE HighlightComment (
  Id TEXT PRIMARY KEY,
  HighlightId TEXT NOT NULL REFERENCES Highlight(Id) ON DELETE CASCADE,
  UserId TEXT NOT NULL REFERENCES UserAccount(Id),
  Body TEXT NOT NULL CHECK (length(Body) BETWEEN 1 AND 500),
  CreatedAt TEXT NOT NULL
);
CREATE INDEX IX_HighlightComment_Feed ON HighlightComment(HighlightId, CreatedAt DESC, Id DESC);
