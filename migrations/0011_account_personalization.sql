-- Preserve existing per-room choices. Latest updated profile wins ties by PlayerId.
ALTER TABLE UserAccount ADD COLUMN AvatarImageUrl TEXT NULL;
ALTER TABLE UserAccount ADD COLUMN MottoQuoteId TEXT NULL;
ALTER TABLE PlayerFunProfile ADD COLUMN RepresentativeAchievementId TEXT NULL;

UPDATE UserAccount SET MottoQuoteId=(
  SELECT f.MottoQuoteId FROM PlayerFunProfile f
  JOIN Player p ON p.Id=f.PlayerId
  WHERE p.UserId=UserAccount.Id AND f.MottoQuoteId IS NOT NULL
  ORDER BY f.UpdatedAt DESC,f.PlayerId DESC LIMIT 1
);
-- Keep the existing image URL; no binary is copied or deleted.
UPDATE UserAccount SET AvatarImageUrl=(
  SELECT p.AvatarImageUrl FROM Player p
  WHERE p.UserId=UserAccount.Id AND p.AvatarImageUrl IS NOT NULL
  ORDER BY p.UpdatedAt DESC,p.Id DESC LIMIT 1
);
UPDATE UserAccount SET AvatarImageUrl=(
  SELECT '/api/media/'||m.Id FROM MediaImage m
  WHERE m.OwnerUserId=UserAccount.Id AND m.Purpose='Avatar'
    AND m.GroupId IS NULL AND m.DeletedAt IS NULL
  ORDER BY m.CreatedAt DESC,m.Id DESC LIMIT 1
) WHERE AvatarImageUrl IS NULL;

-- One presentation projection keeps official identity global and guest identity local.
CREATE VIEW PlayerPresentation AS
SELECT p.Id,p.GroupId,p.UserId,
  CASE WHEN p.UserId IS NULL THEN p.DisplayName ELSE u.DisplayName END AS DisplayName,
  p.IsGuest,p.IsArchived,p.CreatedAt,p.UpdatedAt,
  CASE WHEN p.UserId IS NULL THEN p.AvatarImageUrl ELSE u.AvatarImageUrl END AS AvatarImageUrl
FROM Player p LEFT JOIN UserAccount u ON u.Id=p.UserId;
