import { afterEach, beforeEach, onTestFinished, expect, it, vi, describe } from 'vitest'
import { validate as uuidValidate, version as uuidVersion } from 'uuid'
import { ensureAnonymousSession } from '../index.mts'

const now = process.env.VOUCH_PROOF_NOW
  ? Date.parse(process.env.VOUCH_PROOF_NOW)
  : Date.UTC(2026, 0, 31, 23, 59, 59)

if (
  !Number.isFinite(now) ||
  (process.env.VOUCH_PROOF_NOW !== undefined && !process.env.VOUCH_PROOF_NOW.endsWith('Z'))
) {
  throw new Error('VOUCH_PROOF_NOW must be a finite UTC timestamp ending in Z')
}

describe('mint', () => {
  beforeEach(() => {
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mints UUIDv7 ids without crypto.randomUUID', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID should not be called')
    })
    try {
      const result = await ensureAnonymousSession({})
      expect(result.mintedDt).toBe(true)
      expect(result.mintedSt).toBe(true)
      expect(uuidValidate(result.did)).toBe(true)
      expect(uuidVersion(result.did)).toBe(7)
      expect(uuidValidate(result.sid)).toBe(true)
      expect(uuidVersion(result.sid)).toBe(7)
    } finally {
      randomUUID.mockRestore()
    }
  })
})
