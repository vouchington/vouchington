import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { enqueueAcknowledgeGooglePlayPurchase } from '@queues/memberships/enqueues'
import { claimPendingMembershipVerification } from '../verification-recovery.mts'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
import { ProviderMembershipSourceConflictError } from '../provider-source.mts'
import { GooglePlayLineageConflictError, resolveGooglePlayTokenLineage } from './lineage.mts'
import { preflightGooglePlayCurrentSubscription } from './process-preflight.mts'
import { fetchGooglePlaySubscription } from './subscription-fetch.mts'
import type { GooglePlayVerificationContext } from './context.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { terminalizeKnownGooglePlaySource } from './permanent-lookup-loss.mts'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'
import {
  allocateGooglePlayObservationOrder,
  deferGooglePlayVerification,
  getContext,
  getMapping,
  getPurchaseToken,
  reject,
  terminalizeGooglePlayConflict,
} from './verification-persistence.mts'
import {
  deferPendingGooglePlayVerification,
  finalizeVerifiedGooglePlayMembership,
  persistPendingGooglePlaySource,
  persistVerifiedGooglePlayObservation,
} from './verification-finalization.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

export type Context = GooglePlayVerificationContext

/** Worker authority: fetches subscriptionsv2, then persists/projections its normalized source state. */
export async function processGooglePlayMembershipVerification(
  verificationId: string,
  dependencies: { client: GooglePlaySubscriptionsV2Client },
): Promise<void> {
  const claim = await claimPendingMembershipVerification(verificationId)
  if (!claim) return
  let submittedPurchaseToken: string | null = null
  let providerOrder: number | null = null
  try {
    await using query = await beginTransaction()
    const context = await getContext(claim.id, claim.processingClaimToken, query)
    if (!context) return
    if (context.evidenceRejectedAt)
      return await reject(
        context,
        claim.processingClaimToken,
        context.evidenceRejectionReason ?? 'invalid_evidence',
        query,
      )
    const purchaseToken = getPurchaseToken(context)
    if (!purchaseToken)
      return await reject(context, claim.processingClaimToken, 'invalid_evidence', query)
    submittedPurchaseToken = purchaseToken
    // Do not retain a transaction while calling Google. The lease fences finalization.
    await query.commit()
    providerOrder = await allocateGooglePlayObservationOrder()
    const currentSubscription = await fetchGooglePlaySubscription({
      client: dependencies.client,
      applicationId: context.applicationId,
      purchaseToken,
    })
    await using validationQuery = await beginTransaction()
    const validation = await getContext(claim.id, claim.processingClaimToken, validationQuery)
    if (!validation) return
    const preflight = await preflightGooglePlayCurrentSubscription({
      context: validation,
      purchaseToken,
      subscription: currentSubscription,
      query: validationQuery,
    })
    if (preflight.reasonCode)
      return await reject(
        validation,
        claim.processingClaimToken,
        preflight.reasonCode,
        validationQuery,
      )
    await validationQuery.commit()
    const resolved = await resolveGooglePlayTokenLineage({
      client: dependencies.client,
      environment: context.environment,
      applicationId: context.applicationId,
      purchaseToken,
      currentSubscription,
    })
    const subscription = resolved.currentSubscription
    await using finalizeQuery = await beginTransaction()
    const fresh = await getContext(claim.id, claim.processingClaimToken, finalizeQuery)
    if (!fresh) return
    const mapping = await getMapping(fresh, subscription, finalizeQuery)
    if (!mapping)
      return await reject(fresh, claim.processingClaimToken, 'wrong_product', finalizeQuery)
    const result = verifyGooglePlaySubscription({
      subscription,
      purchaseToken,
      applicationId: fresh.applicationId,
      environment: fresh.environment,
      expectedProduct: {
        ...mapping,
        expectedObfuscatedAccountId: createHash('sha256').update(fresh.userId).digest('hex'),
      },
    })
    if (!result.accepted) {
      if (result.bindablePending) {
        await persistPendingGooglePlaySource(fresh, resolved, finalizeQuery)
        await deferPendingGooglePlayVerification(fresh, claim.processingClaimToken, finalizeQuery)
        return
      }
      return await reject(fresh, claim.processingClaimToken, result.reasonCode, finalizeQuery)
    }
    const verified = await persistVerifiedGooglePlayObservation(
      fresh,
      resolved,
      mapping,
      result.observation,
      providerOrder,
      finalizeQuery,
    )
    const finalized = await finalizeVerifiedGooglePlayMembership({
      context: fresh,
      token: claim.processingClaimToken,
      mapping,
      purchaseToken,
      acknowledgementPending: result.acknowledgementPending,
      lineageId: verified.lineageId,
      observationId: verified.observationId,
      query: finalizeQuery,
    })
    if (finalized.acknowledgementId)
      await enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId: finalized.acknowledgementId })
  } catch (error) {
    if (
      error instanceof GooglePlaySubscriptionLookupError &&
      error.invalidPurchaseToken &&
      submittedPurchaseToken !== null &&
      error.purchaseTokenDigest ===
        createHash('sha256').update(submittedPurchaseToken).digest('hex')
    ) {
      if (
        error.status === 404 ||
        error.status === 410 ||
        (error.status === 400 && error.reason === 'subscriptionExpired')
      ) {
        try {
          if (
            providerOrder !== null &&
            (await terminalizeKnownGooglePlaySource({
              verificationId: claim.id,
              claimToken: claim.processingClaimToken,
              purchaseTokenDigest: error.purchaseTokenDigest,
              providerOrder,
            }))
          )
            return
        } catch (terminalizationError) {
          await deferGooglePlayVerification(
            claim.id,
            claim.processingClaimToken,
            terminalizationError,
          )
          return
        }
      }
      await using query = await beginTransaction()
      const context = await getContext(claim.id, claim.processingClaimToken, query)
      if (context) await reject(context, claim.processingClaimToken, 'invalid_evidence', query)
      return
    }
    if (error instanceof DirectMembershipSourceRejectedError) {
      await terminalizeGooglePlayConflict(
        claim.id,
        claim.processingClaimToken,
        'competing_direct_source',
      )
      return
    }
    if (
      error instanceof GooglePlayLineageConflictError ||
      error instanceof ProviderMembershipSourceConflictError
    ) {
      await terminalizeGooglePlayConflict(claim.id, claim.processingClaimToken, 'wrong_account')
      return
    }
    await deferGooglePlayVerification(claim.id, claim.processingClaimToken, error)
  }
}
