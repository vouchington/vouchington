/** Throws for a value excluded by a TypeScript discriminated union. */
export function assertNever(value: never, label?: string): never {
  throw new Error(`${label ?? 'Unexpected value'}: ${String(value)}`)
}
