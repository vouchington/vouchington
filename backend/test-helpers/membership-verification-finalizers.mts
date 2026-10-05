import { beginTransaction } from '@data-stores/psql'
import { getContext as googleContext } from '../services/memberships/google/verification-context.mts'
import { getContext as microsoftContext } from '../services/memberships/microsoft/verification-persistence.mts'
import * as google from '../services/memberships/google/verification-persistence.mts'
import * as microsoft from '../services/memberships/microsoft/verification-outcomes.mts'
import { deferPendingGooglePlayVerification } from '../services/memberships/google/verification-finalization.mts'
import type { Context } from '../services/memberships/google/process-verification-types.mts'
import {
  getClaimedAppleVerification,
  type AppleVerificationContext,
} from '../services/memberships/apple/process-verification-context.mts'
import { finalizeAppleVerification } from '../services/memberships/apple/process-verification-finalize.mts'

type Provider = 'google_play' | 'microsoft_store'

export async function getTestClaimedProviderVerificationContext(
  provider: Provider,
  id: string,
  token: string,
) {
  await using query = await beginTransaction()
  const getContext = provider === 'google_play' ? googleContext : microsoftContext
  return await getContext(id, token, query)
}

/** Disposal rolls back any evidence write when the real finalizer rejects the stale owner. */
export async function finalizeTestClaimedProviderVerification(
  provider: Provider,
  context: Context,
  token: string,
  disposition: 'verify' | 'reject',
): Promise<void> {
  await using query = await beginTransaction()
  const outcomes = provider === 'google_play' ? google : microsoft
  if (disposition === 'verify') await outcomes.finalizeVerified(context, token, query)
  else await outcomes.reject(context, token, 'invalid_evidence', query)
}

export async function deferTestPendingGoogleVerification(
  context: Context,
  token: string,
): Promise<void> {
  await using query = await beginTransaction()
  await deferPendingGooglePlayVerification(context, token, query)
}

export async function getTestClaimedAppleVerificationContext(id: string, token: string) {
  await using query = await beginTransaction()
  return await getClaimedAppleVerification(id, token, query)
}

export async function finalizeTestClaimedAppleVerification(
  context: AppleVerificationContext,
  token: string,
): Promise<void> {
  await using query = await beginTransaction()
  await finalizeAppleVerification(context, token, 'verified', 'verified', query)
}
