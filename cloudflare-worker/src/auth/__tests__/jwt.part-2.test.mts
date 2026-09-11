import { describe, expect, it } from 'vitest'
import {
  mintUUIDv7,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import { deriveSessionCachePayload, isAuthShapedSessionToken } from '../jwt.mts'
import { createSignedSessionJwt } from '../test-jwt-fixtures.mts'

describe('jwt', () => {
  describe('deriveSessionCachePayload', () => {
    it('returns null when devicePayload is null', () => {
      const sessionPayload: SessionTokenPayload = {
        did: mintUUIDv7(),
        uid: mintUUIDv7(),
        sid: mintUUIDv7(),
      }
      expect(deriveSessionCachePayload(null, sessionPayload)).toBeNull()
    })

    it('returns null when sessionPayload is null', () => {
      const devicePayload: DeviceTokenPayload = { did: mintUUIDv7() }
      expect(deriveSessionCachePayload(devicePayload, null)).toBeNull()
    })

    it('returns the cache payload when did matches and uid is a non-empty string', () => {
      const did = mintUUIDv7()
      const uid = mintUUIDv7()
      const devicePayload: DeviceTokenPayload = { did }
      const sessionPayload: SessionTokenPayload = {
        did,
        uid,
        sid: mintUUIDv7(),
        tt: 1,
        rol: ['admin'],
        mpl: 'x',
        uil: 'en',
      }

      expect(deriveSessionCachePayload(devicePayload, sessionPayload)).toEqual({
        uid,
        tt: 1,
        rol: ['admin'],
        mpl: 'x',
        uil: 'en',
      })
    })

    it('returns null when device and session did values differ', () => {
      const devicePayload: DeviceTokenPayload = { did: mintUUIDv7() }
      const sessionPayload: SessionTokenPayload = {
        did: mintUUIDv7(),
        uid: mintUUIDv7(),
        sid: mintUUIDv7(),
      }
      expect(deriveSessionCachePayload(devicePayload, sessionPayload)).toBeNull()
    })

    it('returns null when uid is null (anon session)', () => {
      const did = mintUUIDv7()
      const devicePayload: DeviceTokenPayload = { did }
      const sessionPayload: SessionTokenPayload = { did, uid: null, sid: mintUUIDv7() }
      expect(deriveSessionCachePayload(devicePayload, sessionPayload)).toBeNull()
    })

    it('returns null when uid is an empty string', () => {
      const did = mintUUIDv7()
      const devicePayload: DeviceTokenPayload = { did }
      const sessionPayload: SessionTokenPayload = { did, uid: '', sid: mintUUIDv7() }
      expect(deriveSessionCachePayload(devicePayload, sessionPayload)).toBeNull()
    })

    it('returns null when sid is an empty string', () => {
      const did = mintUUIDv7()
      const devicePayload: DeviceTokenPayload = { did }
      const sessionPayload: SessionTokenPayload = { did, uid: mintUUIDv7(), sid: '' }
      expect(deriveSessionCachePayload(devicePayload, sessionPayload)).toBeNull()
    })
  })

  describe('isAuthShapedSessionToken', () => {
    it('returns false when the token is absent', () => {
      expect(isAuthShapedSessionToken(null)).toBe(false)
    })

    it('returns false for a garbage/undecodable token', () => {
      expect(isAuthShapedSessionToken('not-a-real-token')).toBe(false)
    })

    it('returns false for a validly-signed anon session (uid: null)', async () => {
      const token = await createSignedSessionJwt({
        did: mintUUIDv7(),
        uid: null,
        sid: mintUUIDv7(),
      })

      expect(isAuthShapedSessionToken(token)).toBe(false)
    })

    it('returns true for a validly-signed session claiming a real user (uid non-null)', async () => {
      const token = await createSignedSessionJwt({
        did: mintUUIDv7(),
        uid: mintUUIDv7(),
        sid: mintUUIDv7(),
      })

      expect(isAuthShapedSessionToken(token)).toBe(true)
    })
  })
})
