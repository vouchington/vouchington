import { getContext } from './verification-context.mts'
import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { enqueueAcknowledgeGooglePlayPurchase } from '@queues/memberships/enqueues'
import { claimPendingMembershipVerification } from '../verification-recovery.mts'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
import { ProviderMembershipSourceConflictError } from '../provider-source.mts'
import { GooglePlayLineageConflictError, resolveGooglePlayTokenLineage } from './lineage.mts'
import { preflightGooglePlayCurrentSubscription } from './process-preflight.mts'
import { fetchGooglePlaySubscription } from './subscription-fetch.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { terminalizeKnownGooglePlaySource } from './permanent-lookup-loss.mts'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'
import {
  allocateGooglePlayObservationOrder,
  deferGooglePlayVerification,
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
    const context = await getContext(claim.id, claim.leaseToken, query)
    if (!context) return
    if (context.evidenceRejectedAt)
      return await reject(
        context,
        claim.leaseToken,
        context.evidenceRejectionReason ?? 'invalid_evidence',
        query,
      )
    const purchaseToken = getPurchaseToken(context)
    if (!purchaseToken) return await reject(context, claim.leaseToken, 'invalid_evidence', query)
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
    const validation = await getContext(claim.id, claim.leaseToken, validationQuery)
    if (!validation) return
    const preflight = await preflightGooglePlayCurrentSubscription({
      context: validation,
      purchaseToken,
      subscription: currentSubscription,
      query: validationQuery,
    })
    if (preflight.reasonCode)
      return await reject(validation, claim.leaseToken, preflight.reasonCode, validationQuery)
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
    const fresh = await getContext(claim.id, claim.leaseToken, finalizeQuery)
    if (!fresh) return
    const mapping = await getMapping(fresh, subscription, finalizeQuery)
    if (!mapping) return await reject(fresh, claim.leaseToken, 'wrong_product', finalizeQuery)
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
        await deferPendingGooglePlayVerification(fresh, claim.leaseToken, finalizeQuery)
        return
      }
      return await reject(fresh, claim.leaseToken, result.reasonCode, finalizeQuery)
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
      token: claim.leaseToken,
      mapping,
      purchaseToken,
      acknowledgementPending: result.acknowledgementPending,
      lineageId: verified.lineageId,
      observationId: verified.observationId,
      query: finalizeQuery,
    })
    if (finalized.acknowledgementId)
      await enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId: finalized.acknowledgementId })
  } catch (err) {
    if (
      err instanceof GooglePlaySubscriptionLookupError &&
      err.invalidPurchaseToken &&
      submittedPurchaseToken !== null &&
      err.purchaseTokenDigest === createHash('sha256').update(submittedPurchaseToken).digest('hex')
    ) {
      if (
        err.status === 404 ||
        err.status === 410 ||
        (err.status === 400 && err.reason === 'subscriptionExpired')
      ) {
        try {
          if (
            providerOrder !== null &&
            (await terminalizeKnownGooglePlaySource({
              verificationId: claim.id,
              claimToken: claim.leaseToken,
              purchaseTokenDigest: err.purchaseTokenDigest,
              providerOrder,
            }))
          )
            return
        } catch (err) {
          await deferGooglePlayVerification(claim.id, claim.leaseToken, err)
          return
        }
      }
      await using query = await beginTransaction()
      const context = await getContext(claim.id, claim.leaseToken, query)
      if (context) await reject(context, claim.leaseToken, 'invalid_evidence', query)
      return
    }
    if (err instanceof DirectMembershipSourceRejectedError) {
      await terminalizeGooglePlayConflict(claim.id, claim.leaseToken, 'competing_direct_source')
      return
    }
    if (
      err instanceof GooglePlayLineageConflictError ||
      err instanceof ProviderMembershipSourceConflictError
    ) {
      await terminalizeGooglePlayConflict(claim.id, claim.leaseToken, 'wrong_account')
      return
    }
    await deferGooglePlayVerification(claim.id, claim.leaseToken, err)
  }
}
