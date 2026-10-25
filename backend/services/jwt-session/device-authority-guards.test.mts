import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { mintAuthenticatedDeviceAuthority } from './device-authority-mint.mts'
import { createDeviceAndSessionTokens } from './create.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { rotateAuthenticatedDeviceToken } from './device-authority-rotation.mts'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'

const userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36'

describe('durable device credential authority guards', () => {
  it('refuses rotation when durable authority has been cleared', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    await write(sql`/* clearTestDeviceAuthority */
      UPDATE user_sessions SET device_token_digest = NULL, device_token_encrypted = NULL,
        device_token_issued_at = NULL, device_token_binding = NULL
      WHERE id = ${sid} AND user_id = ${user.id}`)

    await expect(
      rotateAuthenticatedDeviceToken({
        deviceToken: tokens.deviceToken.token,
        uid: user.id,
        did: tokens.deviceToken.payload.did,
        sid,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })

  it('refuses rotation when the stored browser binding differs from the signed credential', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const row = await readSessionDeviceAuthority(sid)
    const binding = JSON.stringify({ ...row!.device_token_binding, ua_hash: 'f'.repeat(64) })
    await write(sql`/* changeTestDeviceBinding */
      UPDATE user_sessions SET device_token_binding = ${binding}::jsonb
      WHERE id = ${sid} AND user_id = ${user.id}`)

    await expect(
      rotateAuthenticatedDeviceToken({
        deviceToken: tokens.deviceToken.token,
        uid: user.id,
        did: tokens.deviceToken.payload.did,
        sid,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })

  it('rotates the exact stored browser credential while preserving its original lifetime', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const original = tokens.deviceToken.payload
    const rotatedToken = await rotateAuthenticatedDeviceToken({
      deviceToken: tokens.deviceToken.token,
      uid: user.id,
      did: original.did,
      sid: tokens.sessionToken.payload.sid,
    })
    const rotated = await verifyDeviceJwt(rotatedToken)

    expect(rotatedToken).not.toBe(tokens.deviceToken.token)
    expect(rotated).toMatchObject({
      did: original.did,
      refresh_uid: user.id,
      refresh_sid: tokens.sessionToken.payload.sid,
      iat: original.iat,
      exp: original.exp,
    })
    expect(rotated?.jti).not.toBe(original.jti)
  })

  it('rejects a rotation requested for a different principal without changing authority', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const before = await readSessionDeviceAuthority(sid)
    await expect(
      rotateAuthenticatedDeviceToken({
        deviceToken: tokens.deviceToken.token,
        uid: v7(),
        did: tokens.deviceToken.payload.did,
        sid,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await readSessionDeviceAuthority(sid)).toEqual(before)
  })

  it('rejects credential replay after a user-wide cutoff without a SID marker', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const binding = (await readSessionDeviceAuthority(sid))!.device_token_binding!
    const cutoffKey = getJwtUserRevokedBeforeKey(user.id)
    await sessionValkeyClient.set(cutoffKey, String(Math.floor(Date.now() / 1000) + 60))
    try {
      await expect(
        mintAuthenticatedDeviceAuthority({
          uid: user.id,
          did: tokens.deviceToken.payload.did,
          sid,
          binding,
          issuedAt: tokens.deviceToken.payload.iat!,
          credentialReplay: true,
          deviceContext: { user_agent: userAgent },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
      await expect(sessionValkeyClient.get(getJwtRevokedKey(sid))).resolves.toBeNull()
    } finally {
      await sessionValkeyClient.del([cutoffKey])
    }
  })

  it.each([
    { description: 'an unexpected binding field', change: { unexpected: true } },
    { description: 'an invalid browser-agent hash', change: { ua_hash: 'invalid' } },
  ])('rejects $description in durable authority', async ({ change }) => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const row = await readSessionDeviceAuthority(sid)
    const binding = JSON.stringify({ ...row!.device_token_binding, ...change })
    await write(sql`/* corruptTestDeviceBinding */
      UPDATE user_sessions SET device_token_binding = ${binding}::jsonb
      WHERE id = ${sid} AND user_id = ${user.id}`)

    await expect(readSessionDeviceAuthority(sid)).rejects.toMatchObject({
      code: 'SESSION_RELOGIN_REQUIRED',
    })
  })

  it('rejects replay when the durable issue instant no longer matches the signed device', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const row = await readSessionDeviceAuthority(sid)
    await write(sql`/* corruptTestDeviceIssueInstant */
      UPDATE user_sessions SET device_token_issued_at = device_token_issued_at - INTERVAL '1 second'
      WHERE id = ${sid} AND user_id = ${user.id}`)

    await expect(
      mintAuthenticatedDeviceAuthority({
        uid: user.id,
        did: tokens.deviceToken.payload.did,
        sid,
        binding: row!.device_token_binding!,
        issuedAt: tokens.deviceToken.payload.iat!,
        credentialReplay: true,
        deviceContext: { user_agent: userAgent },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    await expect(
      rotateAuthenticatedDeviceToken({
        deviceToken: tokens.deviceToken.token,
        uid: user.id,
        did: tokens.deviceToken.payload.did,
        sid,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })
})
