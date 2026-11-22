import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  clearTestDeviceAuthority,
  replaceTestDeviceAuthorityCiphertext,
  setTestDeviceBinding,
  shiftTestDeviceAuthorityIssuedAt,
} from '@voucha/test-helpers/entities/device-authority'
import { mintAuthenticatedDeviceAuthority } from './device-authority-mint.mts'
import { createDeviceAndSessionTokens } from './create.mts'
import { hashDeviceToken, readSessionDeviceAuthority } from './device-authority.mts'
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
    await clearTestDeviceAuthority(user.id, sid)

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
    await setTestDeviceBinding(user.id, sid, {
      ...row!.device_token_binding,
      ua_hash: 'f'.repeat(64),
    })

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

  it('rejects rotation if the issue time changes without rotating the credential', async () => {
    const { rotate, userId, sid, token } = await createRotationFixture()
    const before = await readSessionDeviceAuthority(sid)
    onTestFinished(
      runBeforePostgresStatementForTest('/* rotateAuthenticatedDeviceToken */', () =>
        shiftTestDeviceAuthorityIssuedAt(userId, sid),
      ),
    )

    await expect(rotate()).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await readSessionDeviceAuthority(sid)).toMatchObject({
      device_token_digest: hashDeviceToken(token),
      device_token_issued_at: new Date(before!.device_token_issued_at!.getTime() - 1_000),
      previous_device_token_digest: null,
      revoked_at: null,
    })
  })

  it.each(['web', 'native'] as const)(
    'settles a losing %s rotation against the committed winner',
    async client => {
      const { rotate, sid, token } = await createRotationFixture(
        client === 'native' ? 'attested' : undefined,
      )
      let winner: string | undefined
      onTestFinished(
        runBeforePostgresStatementForTest('/* rotateAuthenticatedDeviceToken */', async () => {
          winner = await rotate()
        }),
      )

      const [loser] = await Promise.allSettled([rotate()])
      const expectedOutcome =
        client === 'web'
          ? { status: 'fulfilled', value: winner }
          : { status: 'rejected', reason: { code: 'SESSION_REFRESH_REUSED' } }
      const revokedDate = expect.any(Date)
      const expectedRevocation = client === 'native' ? revokedDate : null

      expect(winner).toBeTypeOf('string')
      expect(loser).toMatchObject(expectedOutcome)
      expect(await readSessionDeviceAuthority(sid)).toMatchObject({
        device_token_digest: hashDeviceToken(winner!),
        previous_device_token_digest: hashDeviceToken(token),
        revoked_at: expectedRevocation,
      })
    },
  )

  it('rejects replay when the persisted ciphertext holds a different valid credential', async () => {
    const { rotate, userId, sid } = await createRotationFixture()
    const initial = await readSessionDeviceAuthority(sid)
    const rotated = await rotate()
    await replaceTestDeviceAuthorityCiphertext(userId, sid, initial!.device_token_encrypted!)

    await expect(rotate()).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await readSessionDeviceAuthority(sid)).toMatchObject({
      device_token_digest: hashDeviceToken(rotated),
      device_token_encrypted: initial!.device_token_encrypted,
      revoked_at: null,
    })
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
    await setTestDeviceBinding(user.id, sid, { ...row!.device_token_binding, ...change })

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
    await shiftTestDeviceAuthorityIssuedAt(user.id, sid)

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

async function createRotationFixture(deviceClass?: 'attested') {
  const user = await createTestUserDirect()
  const did = v7()
  const tokens = await createDeviceAndSessionTokens({
    uid: user.id,
    did,
    deviceClass,
    deviceContext: { user_agent: userAgent },
  })
  const sid = tokens.sessionToken.payload.sid
  const token = tokens.deviceToken.token
  return {
    userId: user.id,
    sid,
    token,
    rotate: () => rotateAuthenticatedDeviceToken({ deviceToken: token, uid: user.id, did, sid }),
  }
}
