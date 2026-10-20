type Room = { Id: string };
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const key = (userId: string) => `mahjong:last-room:${userId}`;

export function lastRoom(
  userId: string,
  storage?: StorageAccess,
): string | null {
  try {
    return (storage ?? window.localStorage).getItem(key(userId));
  } catch {
    return null;
  }
}
export function rememberRoom(
  userId: string,
  roomId: string,
  storage?: StorageAccess,
) {
  try {
    (storage ?? window.localStorage).setItem(key(userId), roomId);
  } catch {
    /* Storage can be disabled; room switching must still work. */
  }
}
export function selectRoom(
  rooms: Room[],
  preferred?: string | null,
  remembered?: string | null,
) {
  return (
    [preferred, remembered].find(
      (id) => id && rooms.some((room) => room.Id === id),
    ) ||
    rooms[0]?.Id ||
    ""
  );
}
