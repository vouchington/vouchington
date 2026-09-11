export function normalizePositiveInteger(
  value: number | undefined,
  defaultValue: number,
  name: string,
): number {
  const resolved = value ?? defaultValue
  if (resolved === Infinity) return resolved
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return resolved
}
