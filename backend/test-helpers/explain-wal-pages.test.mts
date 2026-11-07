import { describe, expect, it } from 'vitest'
import { coldWalPageAddress, selectSealedUsers } from '@voucha/test-helpers/explain-wal-pages'

const id = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'

function fixture(count = 30) {
  const image = Buffer.alloc(8192)
  image.writeUInt16LE(24 + count * 4, 12)
  image.writeUInt16LE(8192 - count * 264, 14)
  image.writeUInt16LE(8192, 16)
  image.writeUInt16LE(8196, 18)
  const rows = Array.from({ length: count }, (_, index) => {
    const tupleOffset = 8192 - (index + 1) * 264
    image.writeUInt32LE((264 << 17) | (1 << 15) | tupleOffset, 24 + index * 4)
    image[tupleOffset + 22] = 24
    Buffer.from(id.replaceAll('-', ''), 'hex').copy(image, tupleOffset + 24)
    return { id, page: 7, line: index + 1 }
  })
  return { image, rows }
}

describe('cold WAL physical page selection', () => {
  it('selects one owned row from a sealed page and ignores unused slots', () => {
    const { image, rows } = fixture()
    image.writeUInt32LE(0, 24 + 29 * 4)
    expect(selectSealedUsers(rows.slice(0, 29), new Map([[7, image]]), 155)).toEqual([id])
  })

  it('rejects a page with room for another minimum tuple', () => {
    const { image, rows } = fixture(29)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it('rejects a hole that fits the catalog lower bound despite larger observed tuples', () => {
    const { image, rows } = fixture()
    // Shorten the last physical tuple, leaving a 164-byte hole. The observed
    // tuple minimum is still 228, but a different valid users row can be smaller.
    image.copy(image, 308, 272, 500)
    image.writeUInt32LE((228 << 17) | (1 << 15) | 308, 24 + 29 * 4)
    image.writeUInt16LE(308, 14)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it('rejects a foreign normal tuple even when another tuple is owned', () => {
    const { image, rows } = fixture()
    expect(selectSealedUsers(rows.slice(1), new Map([[7, image]]), 155)).toEqual([])
  })

  it.each([2, 3])('rejects non-owned physical state %i', flags => {
    const { image, rows } = fixture()
    image.writeUInt32LE((flags << 15) | 1, 24)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it('rejects a reused slot whose physical UUID differs from the owned id', () => {
    const { image, rows } = fixture()
    rows[0] = { id: otherId, page: 7, line: 1 }
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it.each([
    [12, 20],
    [12, 145],
    [12, 300],
    [14, 8193],
    [16, 8191],
    [18, 36],
  ])('rejects malformed header field %i=%i', (offset, value) => {
    const { image, rows } = fixture()
    image.writeUInt16LE(value, offset)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it('rejects an incomplete page image and missing page', () => {
    const { image, rows } = fixture()
    expect(selectSealedUsers(rows, new Map([[7, image.subarray(0, 100)]]), 155)).toEqual([])
    expect(selectSealedUsers(rows, new Map(), 155)).toEqual([])
    expect(selectSealedUsers([], new Map(), 155)).toEqual([])
  })

  it.each([
    [0, 264],
    [7928, 22],
    [8100, 264],
  ])('rejects invalid tuple offset %i and length %i', (offset, length) => {
    const { image, rows } = fixture()
    image.writeUInt32LE((length << 17) | (1 << 15) | offset, 24)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it.each([0, 250])('rejects invalid tuple header size %i', size => {
    const { image, rows } = fixture()
    image[7928 + 22] = size
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })

  it('does not select a page containing only unused pointers', () => {
    const { image, rows } = fixture()
    image.fill(0, 24, 144)
    expect(selectSealedUsers(rows, new Map([[7, image]]), 155)).toEqual([])
  })
})

describe('cold WAL relation segment addresses', () => {
  it('addresses both sides of the first and second segment boundaries', () => {
    expect(coldWalPageAddress('base/1/2', 131071, 1073741824)).toEqual({
      path: 'base/1/2',
      offset: 1073733632,
    })
    expect(coldWalPageAddress('base/1/2', 131072, 1073741824)).toEqual({
      path: 'base/1/2.1',
      offset: 0,
    })
    expect(coldWalPageAddress('base/1/2', 262145, 1073741824)).toEqual({
      path: 'base/1/2.2',
      offset: 8192,
    })
  })

  it('uses the configured segment size', () => {
    expect(coldWalPageAddress('base/1/2', 3, 16384)).toEqual({ path: 'base/1/2.1', offset: 8192 })
  })

  it.each([
    [-1, 8192],
    [0.5, 8192],
    [0, 1],
    [0, 0],
  ])('rejects invalid page %i or segment size %i', (page, bytes) => {
    expect(() => coldWalPageAddress('base/1/2', page, bytes)).toThrow(
      'Unsupported cold WAL heap page address',
    )
  })
})
