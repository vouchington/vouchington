const USERS_PAGE_BYTES = 8192
const PAGE_HEADER_BYTES = 24
const LINE_POINTER_BYTES = 4
const LINE_POINTER_NORMAL = 1

export type LocatedUser = { id: string; page: number; line: number }

type OwnedPage = { hole: number; ids: string[] }

function ownedPage(image: Buffer, owned: ReadonlyMap<number, string>): OwnedPage | undefined {
  if (image.length !== USERS_PAGE_BYTES) return undefined
  const lower = image.readUInt16LE(12)
  const upper = image.readUInt16LE(14)
  const special = image.readUInt16LE(16)
  // PostgreSQL's supported test images use 8 KiB, little-endian heap pages,
  // layout version 4. Reject another physical format rather than misread it.
  if (
    image.readUInt16LE(18) !== (USERS_PAGE_BYTES | 4) ||
    lower < PAGE_HEADER_BYTES ||
    lower > upper ||
    upper > special ||
    special !== USERS_PAGE_BYTES ||
    (lower - PAGE_HEADER_BYTES) % LINE_POINTER_BYTES !== 0
  ) {
    return undefined
  }
  const ids: string[] = []
  for (let offset = PAGE_HEADER_BYTES; offset < lower; offset += LINE_POINTER_BYTES) {
    const raw = image.readUInt32LE(offset)
    const flags = (raw >>> 15) & 0x3
    if (flags === 0) continue // LP_UNUSED has no tuple to mutate or prune.
    const id = owned.get((offset - PAGE_HEADER_BYTES) / LINE_POINTER_BYTES + 1)
    if (flags !== LINE_POINTER_NORMAL || id === undefined) return undefined
    const tupleOffset = raw & 0x7fff
    const length = (raw >>> 17) & 0x7fff
    if (tupleOffset < upper || length < 23 || tupleOffset + length > special) return undefined
    const headerBytes = image[tupleOffset + 22]!
    if (headerBytes < 23 || headerBytes + 16 > length) return undefined
    // users.id is its first, non-null attribute; PostgreSQL stores UUID bytes
    // in their textual order. Verify identity, not only the reusable CTID slot.
    const uuid = image.subarray(tupleOffset + headerBytes, tupleOffset + headerBytes + 16)
    if (uuid.toString('hex') !== id.replaceAll('-', '')) return undefined
    ids.push(id)
  }
  return { hole: upper - lower, ids }
}

export function selectSealedUsers(
  rows: readonly LocatedUser[],
  images: ReadonlyMap<number, Buffer>,
  minimumTupleBytes: number,
): string[] {
  const owned = new Map<number, Map<number, string>>()
  for (const row of rows) {
    const page = owned.get(row.page) ?? new Map<number, string>()
    page.set(row.line, row.id)
    owned.set(row.page, page)
  }
  const pages: OwnedPage[] = []
  for (const [page, lines] of owned) {
    const image = images.get(page)
    if (!image) continue
    const parsed = ownedPage(image, lines)
    if (parsed && parsed.ids.length > 0) pages.push(parsed)
  }
  // PageGetHeapFreeSpace reserves a line pointer even if one is reusable.
  // The catalog bound excludes nullable defaults, variable payload, alignment,
  // and null-bitmap overhead, so it cannot overestimate a valid users tuple.
  const sealedBelow = minimumTupleBytes + LINE_POINTER_BYTES
  return pages.flatMap(page => (page.hole < sealedBelow ? page.ids.slice(0, 1) : []))
}

export function coldWalPageAddress(path: string, page: number, segmentBytes: number) {
  const blocksPerSegment = segmentBytes / USERS_PAGE_BYTES
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(blocksPerSegment) ||
    blocksPerSegment < 1
  ) {
    throw new Error('Unsupported cold WAL heap page address')
  }
  const segment = Math.floor(page / blocksPerSegment)
  return {
    path: segment === 0 ? path : `${path}.${segment}`,
    offset: (page % blocksPerSegment) * USERS_PAGE_BYTES,
  }
}
