import { encodeCursor } from '@modules/pagination'

/**
 * `after` cursor for a UUID-keyset list whose first page starts at `id`. The test database is shared
 * and never cleaned, so a global list read from its head returns other tests' rows first; seeking
 * to the UUID immediately below an owned row starts the page at that row. PostgreSQL orders `uuid`
 * bytewise, which matches the 128-bit numeric order used here.
 */
export function encodeUuidCursorBefore(id: string): string {
  const value = BigInt(`0x${id.replaceAll('-', '')}`)
  if (value === 0n) throw new Error('No UUID sorts before the nil UUID')
  const hex = (value - 1n).toString(16).padStart(32, '0')
  return encodeCursor({
    id: [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-'),
  })
}
