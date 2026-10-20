-- Existing sessions remain NULL (unrecorded). No per-hand entity is introduced.
ALTER TABLE Session ADD COLUMN HandCount INTEGER
 CHECK(HandCount IS NULL OR (typeof(HandCount) = 'integer' AND HandCount >= 1 AND HandCount <= 9007199254740991));
