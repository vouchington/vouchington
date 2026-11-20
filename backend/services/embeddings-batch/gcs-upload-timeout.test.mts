import { describe, expect, it } from 'vitest'
import { gcsUploadTimeoutMs } from './gcs-upload-timeout.mts'

describe('gcsUploadTimeoutMs', () => {
  it('adds a size-scaled transfer allowance to the base deadline', () => {
    expect(gcsUploadTimeoutMs(0)).toBe(120_000)
    expect(gcsUploadTimeoutMs(1024 * 1024)).toBe(121_000)
    expect(gcsUploadTimeoutMs(1_000_000_000)).toBeGreaterThan(120_000)
    expect(gcsUploadTimeoutMs(1_000_000_000)).toBeLessThan(30 * 60_000)
  })

  it('caps very large uploads at a finite deadline', () => {
    expect(gcsUploadTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(30 * 60_000)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid byte size %s',
    byteSize => {
      expect(() => gcsUploadTimeoutMs(byteSize)).toThrow(RangeError)
    },
  )
})
