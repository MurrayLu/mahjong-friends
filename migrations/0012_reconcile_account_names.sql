-- Accounts created with the old generic default can have a named official Player.
-- The most recently updated active official Player wins, with PlayerId as a tie-breaker.
-- Never replace an account that already has a chosen nickname.
UPDATE UserAccount
SET DisplayName = (
  SELECT p.DisplayName
  FROM Player p
  WHERE p.UserId = UserAccount.Id
    AND p.IsGuest = 0
    AND p.IsArchived = 0
    AND trim(p.DisplayName) <> ''
    AND p.DisplayName NOT IN ('玩家', '幽靈')
  ORDER BY p.UpdatedAt DESC, p.Id DESC
  LIMIT 1
),
UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE UserAccount.DisplayName = '玩家'
  AND EXISTS (
    SELECT 1 FROM Player p
    WHERE p.UserId = UserAccount.Id
      AND p.IsGuest = 0
      AND p.IsArchived = 0
      AND trim(p.DisplayName) <> ''
      AND p.DisplayName NOT IN ('玩家', '幽靈')
  );
