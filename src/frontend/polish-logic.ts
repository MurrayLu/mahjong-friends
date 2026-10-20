export function rangeCanApply(dates: string[], from: string, to: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to &&
    dates.length > 0 &&
    from >= dates[0] &&
    to <= dates[dates.length - 1] &&
    dates.some((d) => d >= from && d <= to)
  );
}
export function inviteUrl(origin: string, code: string) {
  return `${origin}/join/${code}`;
}
export async function confirmedDelete(
  confirmed: boolean,
  id: string,
  remove: (id: string) => Promise<void>,
  refresh: () => Promise<void>,
) {
  if (!confirmed) return false;
  await remove(id);
  await refresh();
  return true;
}
