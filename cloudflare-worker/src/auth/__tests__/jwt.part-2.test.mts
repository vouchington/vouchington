import { describe, expect, it } from 'vitest'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { hasAuthCookies } from '../jwt.mts'
import { createSignedSessionJwt } from '../../../test-helpers/jwt-fixtures.mts'

describe('jwt', () => {
  describe('hasAuthCookies session claims', () => {
    it('returns false when the token is absent', () => {
      expect(hasAuthCookies(null, null)).toBe(false)
    })

    it('returns false for a garbage/undecodable token', () => {
      expect(hasAuthCookies('not-a-real-token', null)).toBe(false)
    })

    it('returns false for a validly-signed anon session (uid: null)', async () => {
      const token = await createSignedSessionJwt({
        did: mintUUIDv7(),
        uid: null,
        sid: mintUUIDv7(),
      })

      expect(hasAuthCookies(token, null)).toBe(false)
    })

    it('returns true for a validly-signed session claiming a real user (uid non-null)', async () => {
      const token = await createSignedSessionJwt({
        did: mintUUIDv7(),
        uid: mintUUIDv7(),
        sid: mintUUIDv7(),
      })

      expect(hasAuthCookies(token, null)).toBe(true)
    })
  })
})
