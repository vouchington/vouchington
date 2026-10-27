import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { createReAuthToken } from '@services/mfa/re-auth'
import type { OAuthAccount } from '@services/oauth-accounts'
import { lockActiveAccountSession } from '@services/mfa/active-account-session'
import createHttpError from 'http-errors'
import {
  consumeProviderReAuthChallenge,
  lockLinkedProviderReAuthSubject,
  readProviderReAuthChallenge,
  type ProviderReAuthIdentity,
} from './provider-reauth-challenge.mts'
import {
  getAuthorizationAccount,
  getAuthorizationForCompletion,
} from './authorization-completion-persistence.mts'
import type { BrokerOAuthProvider } from './broker-config.mts'
import type { CompletionRow } from './authorization-completion-types.mts'

/** A completed callback handoff authorizes one separately authenticated proof retrieval. */
export async function completeBrokerProviderReAuthProof(
  currentUserId: string,
  options: { provider: BrokerOAuthProvider; flowId: string; deviceId: string; sessionId: string },
): Promise<string> {
  await using query = await beginTransaction()
  await lockActiveAccountSession(
    currentUserId,
    { sid: options.sessionId, did: options.deviceId },
    query,
  )
  const authorization = await getAuthorizationForCompletion(options.flowId, query)
  if (
    authorization.purpose !== 're_auth' ||
    authorization.provider !== options.provider ||
    authorization.initiating_user_id !== currentUserId ||
    authorization.initiating_device_id !== options.deviceId ||
    authorization.initiating_session_id !== options.sessionId
  ) {
    throw createHttpError(403, 'Provider reauthentication belongs to another session')
  }
  if (authorization.expires_at.getTime() <= Date.now()) {
    throw createHttpError(410, 'Provider reauthentication expired')
  }
  if (
    authorization.status !== 'completed' ||
    authorization.result_kind !== 'connected' ||
    authorization.result_user_id !== currentUserId
  ) {
    throw createHttpError(409, 'Provider reauthentication is not complete')
  }
  await consumeVerifiedBrokerChallenge(authorization, query)
  const token = await createReAuthToken(
    currentUserId,
    { sid: options.sessionId, did: options.deviceId },
    query,
  )
  await query.commit()
  return token
}

export async function assertBrokerProviderReAuthAccount(
  authorization: CompletionRow,
  account: OAuthAccount,
  query: TransactionQuery,
): Promise<ProviderReAuthIdentity> {
  const currentUserId = authorization.initiating_user_id
  if (!currentUserId || account.user_id !== currentUserId) {
    throw createHttpError(403, 'Provider account does not match the linked account')
  }
  const identity: ProviderReAuthIdentity = {
    userId: currentUserId,
    deviceId: authorization.initiating_device_id,
    sessionId: authorization.initiating_session_id,
    flowId: authorization.id,
    provider: authorization.provider,
  }
  const context = await readProviderReAuthChallenge(identity)
  const subject = await lockLinkedProviderReAuthSubject(
    currentUserId,
    authorization.provider,
    query,
  )
  if (subject !== context.providerUserId || account.provider_user_id !== subject) {
    throw createHttpError(403, 'Linked provider account changed during reauthentication')
  }
  return identity
}

async function consumeVerifiedBrokerChallenge(
  authorization: CompletionRow,
  query: TransactionQuery,
) {
  const account = await getAuthorizationAccount(authorization, query)
  const identity = await assertBrokerProviderReAuthAccount(authorization, account, query)
  return consumeProviderReAuthChallenge(identity)
}
