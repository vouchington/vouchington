import { describe, expect, it } from 'vitest'
import { timestampToUuidv7LowerBound } from './uuidv7.mts'

const MAX_UUIDV7_TIMESTAMP_MS = 0xffffffffffff

describe('timestampToUuidv7LowerBound', () => {
  it('encodes the inclusive zero timestamp', () => {
    expect(timestampToUuidv7LowerBound(0)).toBe('00000000-0000-7000-8000-000000000000')
  })

  it('encodes the inclusive 48-bit maximum timestamp', () => {
    expect(timestampToUuidv7LowerBound(MAX_UUIDV7_TIMESTAMP_MS)).toBe(
      'ffffffff-ffff-7000-8000-000000000000',
    )
  })

  it('rejects a timestamp one millisecond past the 48-bit maximum', () => {
    expect(() => timestampToUuidv7LowerBound(MAX_UUIDV7_TIMESTAMP_MS + 1)).toThrow(
      'Timestamp exceeds UUIDv7 48-bit limit',
    )
  })

  it('rejects a negative timestamp', () => {
    expect(() => timestampToUuidv7LowerBound(-1)).toThrow('Timestamp must be non-negative')
  })

  it.each([1.5, Number.NaN])('rejects non-integral timestamp %s', timestamp => {
    expect(() => timestampToUuidv7LowerBound(timestamp)).toThrow('Timestamp must be a safe integer')
  })
})
