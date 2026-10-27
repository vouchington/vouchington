import { lockActiveAccountSession } from '@services/mfa/active-account-session'
import { createHash, randomBytes } from 'node:crypto'
import { withTransactionOptions, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import {
  hashProviderReAuthNonce,
  type OAuthProviderReAuthContext,
} from '@services/oauth-accounts/reauthentication'
import { providerTableConfigs, type OAuthProvider } from '@services/oauth-accounts'
import { REAUTH_TTL_SECONDS } from '@services/mfa/re-auth'
import { TimeUnit } from '@valkey/valkey-glide'
import createHttpError from 'http-errors'

export type ProviderReAuthIdentity = {
  userId: string
  deviceId: string
  sessionId: string
  flowId: string
  provider: OAuthProvider
}

export type ProviderReAuthChallenge = ProviderReAuthIdentity & OAuthProviderReAuthContext

/** The nonce is freshly issued by this server, independent of an SDK's cached identity token. */
export async function createProviderReAuthChallenge(
  identity: ProviderReAuthIdentity,
  options: QueryOptions = {},
): Promise<{ nonce: string; expiresAt: Date }> {
  return withTransactionOptions(options, async query => {
    await lockActiveAccountSession(
      identity.userId,
      { sid: identity.sessionId, did: identity.deviceId },
      query,
    )
    const providerUserId = await lockLinkedProviderReAuthSubject(
      identity.userId,
      identity.provider,
      query,
    )
    const nonce = randomBytes(32).toString('base64url')
    const expectedNonce =
      identity.provider === 'apple' ? createHash('sha256').update(nonce).digest('hex') : nonce
    const issuedAt = Date.now()
    const context: ProviderReAuthChallenge = {
      ...identity,
      providerUserId,
      nonceHash: hashProviderReAuthNonce(identity.flowId, expectedNonce),
    }
    const stored = await sessionValkeyClient.set(challengeKey(identity), JSON.stringify(context), {
      conditionalSet: 'onlyIfDoesNotExist',
      expiry: { type: TimeUnit.Seconds, count: REAUTH_TTL_SECONDS },
    })
    if (!stored) throw createHttpError(409, 'Provider reauthentication already started')
    return { nonce, expiresAt: new Date(issuedAt + REAUTH_TTL_SECONDS * 1000) }
  })
}

export async function readProviderReAuthChallenge(
  identity: ProviderReAuthIdentity,
): Promise<ProviderReAuthChallenge> {
  const value = await sessionValkeyClient.get(challengeKey(identity))
  return assertChallenge(identity, value as string | null)
}

export async function consumeProviderReAuthChallenge(
  identity: ProviderReAuthIdentity,
): Promise<ProviderReAuthChallenge> {
  const value = await getAndDelete(challengeKey(identity), { client: sessionValkeyClient })
  return assertChallenge(identity, value)
}

/** The user lock serializes disconnect/link changes; the provider row must still belong to them. */
export async function lockLinkedProviderReAuthSubject(
  currentUserId: string,
  provider: OAuthProvider,
  query: TransactionQuery,
): Promise<string> {
  const config = providerTableConfigs[provider]
  const { rows } = await query<{ provider_user_id: string }>(
    `/* lockLinkedProviderReAuthSubject */ SELECT ${config.providerUserIdColumn} AS provider_user_id
     FROM ${config.table} WHERE user_id = $1 FOR UPDATE`,
    [currentUserId],
  )
  if (!rows[0]) throw createHttpError(422, 'Provider account is not linked to this user')
  return rows[0].provider_user_id
}

function challengeKey(identity: ProviderReAuthIdentity): string {
  return `oauth-provider-reauth:${identity.userId}:${identity.sessionId}:${identity.deviceId}:${identity.provider}:${identity.flowId}`
}

function assertChallenge(
  identity: ProviderReAuthIdentity,
  value: string | null,
): ProviderReAuthChallenge {
  if (!value) throw createHttpError(401, 'Provider reauthentication expired or already used')
  const context = JSON.parse(value) as ProviderReAuthChallenge
  if (
    context.userId !== identity.userId ||
    context.sessionId !== identity.sessionId ||
    context.deviceId !== identity.deviceId ||
    context.provider !== identity.provider ||
    context.flowId !== identity.flowId
  ) {
    throw createHttpError(401, 'Provider reauthentication belongs to another session')
  }
  return context
}
