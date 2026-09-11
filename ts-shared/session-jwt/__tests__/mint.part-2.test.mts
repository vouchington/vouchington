import { expect, it, vi, describe } from 'vitest'
import { validate as uuidValidate, version as uuidVersion } from 'uuid'
import { ensureAnonymousSession } from '../index.mts'

describe('mint', () => {
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
