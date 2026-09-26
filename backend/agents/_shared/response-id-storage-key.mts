/** Mirrors the response-key column's length and U+0020 trim constraints before a database write. */
const MAX_RESPONSE_ID_CODE_POINTS = 100

export function isStorableResponseId(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_RESPONSE_ID_CODE_POINTS * 2
  ) {
    return false
  }
  if (value.startsWith(' ') || value.endsWith(' ') || value.includes('\0')) return false
  if (!value.isWellFormed()) return false
  return Array.from(value).length <= MAX_RESPONSE_ID_CODE_POINTS
}
