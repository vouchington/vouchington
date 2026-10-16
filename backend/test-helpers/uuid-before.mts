/**
 * The largest UUID that sorts before `id`, so a keyset page "after" it begins at `id`. A test that
 * shares a database with other tests starts a page here to see its own rows first.
 */
export function uuidBefore(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
