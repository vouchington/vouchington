export function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

export function normalizePositiveInteger(
  value: number | undefined,
  defaultValue: number,
  name: string,
): number {
  return assertPositiveInteger(value ?? defaultValue, name)
}
