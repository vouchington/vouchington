import { assertProviderReAuthNonce } from '@services/oauth-accounts/reauthentication'
import { beginTransaction } from '@data-stores/psql'
import { createReAuthToken } from '@services/mfa/re-auth'
import { lockActiveAccountSession } from '@services/mfa/active-account-session'
import { verifyAppleIdentityToken } from '@services/oauth-apple'
import { verifyGoogleCredential } from '@services/oauth-google'
import createHttpError from 'http-errors'
import { v7 as uuidv7 } from 'uuid'
import { getConfiguredOAuthProviders } from '@services/oauth-accounts/configuration'
import {
  consumeProviderReAuthChallenge,
  createProviderReAuthChallenge,
  lockLinkedProviderReAuthSubject,
  readProviderReAuthChallenge,
  type ProviderReAuthIdentity,
} from './provider-reauth-challenge.mts'

type SdkProvider = 'apple' | 'google'
type SdkReAuthIdentity = Omit<ProviderReAuthIdentity, 'provider'> & { provider: SdkProvider }

export function assertSdkReAuthProvider(value: string | undefined): SdkProvider {
  if (value === 'apple' || value === 'google') return value
  throw createHttpError(404, 'Provider assertion is unavailable')
}

export async function beginSdkProviderReAuth(
  currentUserId: string,
  options: { provider: SdkProvider; deviceId: string; sessionId: string },
): Promise<{ flow_id: string; nonce: string; expires_at: string }> {
  if (!getConfiguredOAuthProviders().includes(options.provider)) {
    throw createHttpError(404, 'Provider reauthentication is unavailable')
  }
  const flowId = uuidv7()
  const { nonce, expiresAt } = await createProviderReAuthChallenge({
    ...options,
    userId: currentUserId,
    flowId,
  })
  return { flow_id: flowId, nonce, expires_at: expiresAt.toISOString() }
}

/** Signature verification establishes provider identity; no account or login is created here. */
export async function completeSdkProviderReAuth(
  currentUserId: string,
  options: Omit<SdkReAuthIdentity, 'userId'> & { credential: string },
): Promise<string> {
  const { provider, deviceId, sessionId, flowId } = options
  const identity: SdkReAuthIdentity = {
    provider,
    deviceId,
    sessionId,
    flowId,
    userId: currentUserId,
  }
  const context = await readProviderReAuthChallenge(identity)
  const claims =
    options.provider === 'apple'
      ? await verifyAppleIdentityToken(options.credential)
      : await verifyGoogleCredential(options.credential)
  assertProviderReAuthNonce(context, claims.nonce)
  if (typeof claims.sub !== 'string' || claims.sub !== context.providerUserId) {
    throw createHttpError(403, 'Provider account does not match the linked account')
  }
  return completeVerifiedSdkProviderReAuth(identity, context.providerUserId)
}

async function completeVerifiedSdkProviderReAuth(
  identity: SdkReAuthIdentity,
  verifiedProviderUserId: string,
): Promise<string> {
  await using query = await beginTransaction()
  await lockActiveAccountSession(
    identity.userId,
    { sid: identity.sessionId, did: identity.deviceId },
    query,
  )
  const linkedSubject = await lockLinkedProviderReAuthSubject(
    identity.userId,
    identity.provider,
    query,
  )
  if (linkedSubject !== verifiedProviderUserId) {
    throw createHttpError(403, 'Linked provider account changed during reauthentication')
  }
  await consumeProviderReAuthChallenge(identity)
  const token = await createReAuthToken(
    identity.userId,
    { sid: identity.sessionId, did: identity.deviceId },
    query,
  )
  await query.commit()
  return token
}
