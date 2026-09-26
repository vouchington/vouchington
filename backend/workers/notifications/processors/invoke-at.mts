export function invokeAt<T>(
  run: (now: Date) => Promise<T>,
  now: (() => Date) | undefined,
): Promise<T> {
  return run((now ?? (() => new Date()))())
}
