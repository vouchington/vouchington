import { describe, expect, it } from 'vitest'
import { rollUpBucketStatus } from './partial-bucket.mts'

describe('rollUpBucketStatus', () => {
  it('returns "ok" when no kind was attempted', () => {
    expect(rollUpBucketStatus([])).toBe('ok')
    expect(rollUpBucketStatus([{ attempted: false, failed: false }])).toBe('ok')
  })

  it('returns "ok" when every attempted kind succeeded', () => {
    expect(
      rollUpBucketStatus([
        { attempted: true, failed: false },
        { attempted: false, failed: false },
      ]),
    ).toBe('ok')
  })

  it('returns "partial" when some but not all attempted kinds failed', () => {
    expect(
      rollUpBucketStatus([
        { attempted: true, failed: true },
        { attempted: true, failed: false },
      ]),
    ).toBe('partial')
  })

  it('returns "error" when every attempted kind failed', () => {
    expect(
      rollUpBucketStatus([
        { attempted: true, failed: true },
        { attempted: false, failed: false },
      ]),
    ).toBe('error')
  })
})
