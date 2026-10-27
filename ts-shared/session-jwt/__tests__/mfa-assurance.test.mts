import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { signJwt } from '@vouchington/session-jwt'
import { getResolvedKeySet } from '../keys.mts'
import { SESSION_JWT_ISSUER, DEVICE_TOKEN_AUDIENCE, SESSION_TOKEN_AUDIENCE } from '../types.mts'
import { signDeviceJwt, signSessionJwt, verifyDeviceJwt, verifySessionJwt } from '../jwt.mts'

describe('signed original MFA timestamp', () => {
  it('accepts a completed timestamp on matching authenticated device and access payloads', async () => {
    const did = v7(),
      sid = v7(),
      uid = v7()
    const mfa_at = Math.floor(Date.now() / 1000) - 60
    const device = await signDeviceJwt(
      { did, refresh_uid: uid, refresh_sid: sid, mfa_at },
      { expiresIn: '1h' },
    )
    const session = await signSessionJwt({ did, sid, uid, mfa_at }, { expiresIn: '10m' })
    expect((await verifyDeviceJwt(device))?.mfa_at).toBe(mfa_at)
    expect((await verifySessionJwt(session))?.mfa_at).toBe(mfa_at)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects malformed proof %s on both signed payload kinds',
    async mfa_at => {
      const did = v7(),
        sid = v7(),
        uid = v7()
      const device = await signRawPayload(
        { did, refresh_uid: uid, refresh_sid: sid, mfa_at },
        DEVICE_TOKEN_AUDIENCE,
      )
      const session = await signRawPayload({ did, sid, uid, mfa_at }, SESSION_TOKEN_AUDIENCE)
      expect(await verifyDeviceJwt(device)).toBeNull()
      expect(await verifySessionJwt(session)).toBeNull()
    },
  )

  it('rejects future assurance and assurance on anonymous signed credentials', async () => {
    const did = v7(),
      sid = v7(),
      uid = v7()
    const mfa_at = Math.floor(Date.now() / 1000) + 3600
    const device = await signDeviceJwt(
      { did, refresh_uid: uid, refresh_sid: sid, mfa_at },
      { expiresIn: '1h' },
    )
    const session = await signSessionJwt({ did, sid, uid, mfa_at }, { expiresIn: '10m' })
    expect(await verifyDeviceJwt(device)).toBeNull()
    expect(await verifySessionJwt(session)).toBeNull()
    const original = mfa_at - 7200
    const anonymousDevice = await signDeviceJwt({ did, mfa_at: original }, { expiresIn: '1h' })
    const anonymousSession = await signSessionJwt(
      { did, sid, uid: null, mfa_at: original },
      { expiresIn: '10m' },
    )
    expect(await verifyDeviceJwt(anonymousDevice)).toBeNull()
    expect(await verifySessionJwt(anonymousSession)).toBeNull()
  })
})

async function signRawPayload(payload: Record<string, unknown>, audience: string): Promise<string> {
  return signJwt(payload, {
    keySet: await getResolvedKeySet({}),
    issuer: SESSION_JWT_ISSUER,
    audience,
    expiresIn: '1h',
  })
}
