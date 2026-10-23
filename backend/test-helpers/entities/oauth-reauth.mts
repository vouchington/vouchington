import { createTestAccountChangeActor } from '../account-change.mts'
import { v7 } from 'uuid'
import { randomUUID } from 'node:crypto'
import { createSignedJwt } from '../services/oauth-apple/fixtures.mts'
import { createTestUser } from './users.mts'
import { connectTestOAuthAccount, insertTestOAuthAccount } from './oauth-accounts.mts'
import type { ProviderReAuthIdentity } from '../../services/oauth/provider-reauth-challenge.mts'

export async function createTestProviderReAuthIdentity<P extends 'google' | 'apple' | 'microsoft'>(
  provider: P,
): Promise<ProviderReAuthIdentity & { provider: P }> {
  const user = await createTestUser()
  const subject = `provider-reauth-${randomUUID()}`
  await insertTestOAuthAccount(provider, subject)
  await connectTestOAuthAccount(provider, user.id, subject)
  const actor = await createTestAccountChangeActor(user.id)
  return {
    provider,
    userId: user.id,
    flowId: v7(),
    deviceId: actor.session.did,
    sessionId: actor.session.sid,
  }
}

export function createTestProviderReAuthCredential(
  provider: 'google' | 'apple',
  providerUserId: string,
  nonce: string,
  clientId: string,
  now: number,
): string {
  return createSignedJwt(
    { kid: 'reauth-key', alg: 'RS256' },
    {
      iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: clientId,
      sub: providerUserId,
      nonce,
      email: 'tests+untrusted-provider-email@voucha.ai',
      email_verified: true,
      iat: Math.floor(now / 1000) - 1,
      exp: Math.floor(now / 1000) + 300,
    },
  )
}
