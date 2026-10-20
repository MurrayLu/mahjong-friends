CREATE TABLE GroupRatePreset (
  GroupId TEXT NOT NULL REFERENCES "Group"(Id) ON DELETE CASCADE,
  RateMajor INTEGER NOT NULL CHECK(typeof(RateMajor)='integer' AND RateMajor>=0),
  RateMinor INTEGER NOT NULL CHECK(typeof(RateMinor)='integer' AND RateMinor>=0),
  IsCustom INTEGER NOT NULL CHECK(IsCustom IN (0,1)),
  IsSelected INTEGER NOT NULL CHECK(IsSelected IN (0,1)),
  CreatedAt TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL,
  PRIMARY KEY(GroupId,RateMajor,RateMinor)
);
-- Match BUILTIN_RATE_PRESETS; historical sessions are never touched.
INSERT INTO GroupRatePreset
SELECT g.Id,r.major,r.minor,0,r.selected,g.CreatedAt,g.UpdatedAt
FROM "Group" g CROSS JOIN (
  SELECT 30 AS major,10 AS minor,1 AS selected UNION ALL
  SELECT 50,20,1 UNION ALL SELECT 100,20,1 UNION ALL
  SELECT 300,100,0 UNION ALL SELECT 500,200,0
) r;
