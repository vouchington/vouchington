import { afterEach, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { createTestUserDirect, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { createDeviceAndSessionTokens } from './index.mts'
import { authorizeDbscProof, getWebRefreshAuthority } from './dbsc-proof.mts'
import { createDbscRefreshChallenge } from './dbsc-registration.mts'
import { getWebSessionAuthorityKey } from './dbsc-state.mts'

const origin = 'https://dbsc-boundary.example'
const userAgent = 'Synthetic browser boundary/1.0'
const ownedAuthorityKeys: string[] = []

async function createSession() {
  const user = await createTestUserDirect()
  const tokens = await createDeviceAndSessionTokens({
    did: v7(),
    uid: user.id,
    deviceContext: { user_agent: userAgent, origin },
  })
  ownedAuthorityKeys.push(getWebSessionAuthorityKey(tokens.sessionToken.payload.sid))
  return tokens
}

describe('DBSC authoritative storage boundary', () => {
  afterEach(async () => {
    if (ownedAuthorityKeys.length > 0)
      await sessionValkeyClient.unlink(ownedAuthorityKeys.splice(0))
  })

  it.each([
    ['invalid JSON', '{'],
    ['missing identity', '{}'],
    ['wrong stored user', { uid: 'another-user' }],
    ['native authority with web fields', { client: 'native' }],
    ['invalid browser hash', { uaHash: 'invalid' }],
    ['invalid registration nonce', { registrationNonce: 'invalid' }],
    ['invalid origin', { origin: 'not a URL' }],
    ['noncanonical origin', { origin: `${origin}/unexpected` }],
    ['unbound authority with a key', { publicKey: { kty: 'EC' } }],
    ['bound authority without origin', { kind: 'bound', origin: undefined }],
    ['bound authority with HTTP origin', { kind: 'bound', origin: 'http://dbsc-boundary.example' }],
    ['bound authority without a key', { kind: 'bound' }],
    [
      'bound authority with a private key',
      { kind: 'bound', publicKey: { kty: 'EC', d: 'private' } },
    ],
  ])(
    'requires login for %s instead of authorizing from corrupt state',
    async (_name, corruption) => {
      const tokens = await createSession()
      const key = getWebSessionAuthorityKey(tokens.sessionToken.payload.sid)
      const original = String(await sessionValkeyClient.get(key))
      const raw =
        typeof corruption === 'string'
          ? corruption
          : JSON.stringify({ ...JSON.parse(original), ...corruption })
      await sessionValkeyClient.set(key, raw)

      await expect(
        getWebRefreshAuthority(tokens.deviceToken.token, userAgent),
      ).rejects.toMatchObject({
        status: 401,
        code: 'SESSION_RELOGIN_REQUIRED',
      })
      expect(String(await sessionValkeyClient.get(key))).toBe(raw)
    },
  )

  it('rejects a token without signed web refresh authority', async () => {
    await expect(getWebRefreshAuthority('not-a-device-token', userAgent)).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_RELOGIN_REQUIRED',
    })
  })

  it('offers no renewal challenge before binding and rejects malformed structured proof', async () => {
    const tokens = await createSession()
    const options = { deviceToken: tokens.deviceToken.token, userAgent, origin }
    expect(
      await createDbscRefreshChallenge({ ...options, sessionId: tokens.sessionToken.payload.sid }),
    ).toBeNull()
    await expect(
      authorizeDbscProof({
        ...options,
        purpose: 'registration',
        proofHeader: '"unterminated',
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'DBSC_PROOF_INVALID' })
    expect((await getWebRefreshAuthority(options.deviceToken, userAgent)).authority.kind).toBe(
      'unbound',
    )
  })
})
