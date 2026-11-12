export type Edge = readonly [
  table: string,
  fkColumns: readonly string[],
  parentColumns: readonly string[],
  primaryKey: readonly string[],
  selectedColumns: readonly string[],
  cursorColumns: readonly string[],
]
export type Phase = readonly [table: string, path: readonly Edge[], predicate: string | null]

export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Invalid copyright purge identifier')
  return `"${value}"`
}
