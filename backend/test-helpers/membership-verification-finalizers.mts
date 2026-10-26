import { beginTransaction } from '@data-stores/psql'
import { getContext as googleContext } from '../services/memberships/google/verification-context.mts'
import { getContext as microsoftContext } from '../services/memberships/microsoft/verification-persistence.mts'
import * as google from '../services/memberships/google/verification-persistence.mts'
import * as microsoft from '../services/memberships/microsoft/verification-outcomes.mts'
import type { Context } from '../services/memberships/google/process-verification-types.mts'
import {
  getPendingAppleVerification,
  type AppleVerificationContext,
} from '../services/memberships/apple/process-verification-context.mts'
import { finalizeAppleVerification } from '../services/memberships/apple/process-verification-finalize.mts'

type Provider = 'google_play' | 'microsoft_store'

export async function getTestPendingProviderVerificationContext(provider: Provider, id: string) {
  await using query = await beginTransaction()
  const getContext = provider === 'google_play' ? googleContext : microsoftContext
  return await getContext(id, query)
}

/** Disposal rolls back any evidence write when a stale finalizer loses the pending-outcome compare-and-set. */
export async function finalizeTestPendingProviderVerification(
  provider: Provider,
  context: Context,
  disposition: 'verify' | 'reject',
): Promise<void> {
  await using query = await beginTransaction()
  const outcomes = provider === 'google_play' ? google : microsoft
  if (disposition === 'verify') await outcomes.finalizeVerified(context, query)
  else await outcomes.reject(context, 'invalid_evidence', query)
}

export async function getTestPendingAppleVerificationContext(id: string) {
  await using query = await beginTransaction()
  return await getPendingAppleVerification(id, query)
}

export async function finalizeTestPendingAppleVerification(
  context: AppleVerificationContext,
): Promise<void> {
  await using query = await beginTransaction()
  await finalizeAppleVerification(context, 'verified', 'verified', query)
}
