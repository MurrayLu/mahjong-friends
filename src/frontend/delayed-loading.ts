/** Show copy only during real waiting. Completion never waits for the timer. */
export function delayedLoading(
  show: () => void,
  delay = 300,
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout"> = globalThis,
) {
  const timer = timers.setTimeout(show, delay);
  return () => timers.clearTimeout(timer);
}
