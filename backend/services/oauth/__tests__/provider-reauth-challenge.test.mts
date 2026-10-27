import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { v7 } from 'uuid'
import { assertProviderReAuthNonce } from '@services/oauth-accounts/reauthentication'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import { createTestProviderReAuthIdentity } from '@voucha/test-helpers/entities/oauth-reauth'
import {
  consumeProviderReAuthChallenge,
  createProviderReAuthChallenge,
  readProviderReAuthChallenge,
} from '../provider-reauth-challenge.mts'

describe('linked provider reauthentication challenge', () => {
  it('requires a linked provider subject, independent of email ownership', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    expect(user.email_address).toBeTruthy()
    await insertTestOAuthAccount('google', `unlinked-${randomUUID()}`, user.email_address ?? null)
    await expect(
      createProviderReAuthChallenge({
        provider: 'google',
        userId: user.id,
        flowId: v7(),
        deviceId: actor.session.did,
        sessionId: actor.session.sid,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it.each(['google', 'apple'] as const)(
    'binds a fresh signed nonce to one %s flow and consumes once',
    async provider => {
      const identity = await createTestProviderReAuthIdentity(provider)
      const { nonce } = await createProviderReAuthChallenge(identity)
      const context = await readProviderReAuthChallenge(identity)
      const signedNonce =
        provider === 'apple' ? createHash('sha256').update(nonce).digest('hex') : nonce
      expect(() => assertProviderReAuthNonce(context, signedNonce)).not.toThrow()
      expect(() => assertProviderReAuthNonce(context, 'cached-provider-token-nonce')).toThrow(
        'nonce is invalid',
      )
      expect(() => assertProviderReAuthNonce(context, undefined)).toThrow('nonce is invalid')
      await expect(createProviderReAuthChallenge(identity)).rejects.toMatchObject({ status: 409 })
      await expect(
        consumeProviderReAuthChallenge({ ...identity, sessionId: randomUUID() }),
      ).rejects.toMatchObject({ status: 401 })
      await expect(consumeProviderReAuthChallenge(identity)).resolves.toEqual(context)
      await expect(consumeProviderReAuthChallenge(identity)).rejects.toMatchObject({ status: 401 })
    },
  )
})
