import { beginTransaction } from '@data-stores/psql'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
import { ProviderMembershipSourceConflictError } from '../provider-source.mts'
import { claimPendingMembershipVerification } from '../verification-recovery.mts'
import { selectAuthoritativeMicrosoftStoreRecords } from './authoritative-record-selection.mts'
import { createConfiguredMicrosoftStoreClient } from './configured-client.mts'
import { MicrosoftStoreResponseError } from './response-error.mts'
import { commitAcceptedMicrosoftStoreVerification } from './verification-commit.mts'
import { decryptEvidence, expired, getContext, getMapping } from './verification-persistence.mts'
import { defer, reject, terminalizeConflict } from './verification-outcomes.mts'
import type { MicrosoftStoreClient } from './types.mts'
import { verifyMicrosoftStoreAuthoritativeState } from './verify-authoritative-state.mts'

/** Fetches Collections and Recurrence truth in a worker, then atomically records the normalized projection. */
export async function processMicrosoftStoreMembershipVerification(
  verificationId: string,
  dependencies: { client?: MicrosoftStoreClient } = {},
): Promise<void> {
  const claim = await claimPendingMembershipVerification(verificationId)
  if (!claim) return
  try {
    await using initial = await beginTransaction()
    const context = await getContext(claim.id, claim.processingClaimToken, initial)
    if (!context) return
    if (context.evidenceRejectedAt)
      return await reject(
        context,
        claim.processingClaimToken,
        context.evidenceRejectionReason ?? 'invalid_evidence',
        initial,
      )
    const evidence = decryptEvidence(context)
    if (!evidence || evidence.publisherUserId !== context.userId || expired(evidence))
      return await reject(context, claim.processingClaimToken, 'invalid_evidence', initial)
    const mapping = await getMapping(context, evidence, initial)
    if (!mapping) return await reject(context, claim.processingClaimToken, 'wrong_product', initial)
    await initial.commit()

    const client = dependencies.client ?? createConfiguredMicrosoftStoreClient()
    const [collections, recurrences] = await Promise.all([
      client.queryCollections({
        key: evidence.collectionsKey,
        publisherUserId: evidence.publisherUserId,
        productId: mapping.providerProductId,
        skuId: mapping.skuId,
        environment: context.environment,
      }),
      client.queryRecurrences({ key: evidence.purchaseKey, environment: context.environment }),
    ])
    const selection = selectAuthoritativeMicrosoftStoreRecords({
      collections,
      recurrences,
      productId: mapping.providerProductId,
      skuId: mapping.skuId,
      sourceSkuId: evidence.recoverySkuId,
      recurrenceId: evidence.recoveryRecurrenceId,
    })
    if (selection.kind !== 'matched') {
      if (selection.kind === 'lag')
        throw new Error('Microsoft Store Collections/Recurrence response lag')
      await using rejected = await beginTransaction()
      const fresh = await getContext(claim.id, claim.processingClaimToken, rejected)
      if (fresh) await reject(fresh, claim.processingClaimToken, 'invalid_evidence', rejected)
      return
    }
    const result = verifyMicrosoftStoreAuthoritativeState({
      applicationId: context.applicationId,
      environment: context.environment,
      publisherUserId: evidence.publisherUserId,
      membershipProductId: mapping.membershipProductId,
      productId: mapping.providerProductId,
      skuId: mapping.skuId,
      collection: selection.collection,
      recurrence: selection.recurrence,
    })
    await using finalize = await beginTransaction()
    const fresh = await getContext(claim.id, claim.processingClaimToken, finalize)
    if (!fresh) return
    if (!result.accepted)
      return await reject(fresh, claim.processingClaimToken, result.reasonCode, finalize)
    await commitAcceptedMicrosoftStoreVerification({
      context: fresh,
      token: claim.processingClaimToken,
      mapping,
      evidence,
      observation: result.observation,
      query: finalize,
    })
    await finalize.commit()
  } catch (error) {
    if (error instanceof MicrosoftStoreResponseError && error.invalidStoreIdKey) {
      await using query = await beginTransaction()
      const context = await getContext(claim.id, claim.processingClaimToken, query)
      if (context) await reject(context, claim.processingClaimToken, 'invalid_evidence', query)
      return
    }
    if (error instanceof DirectMembershipSourceRejectedError)
      return terminalizeConflict(claim.id, claim.processingClaimToken, 'competing_direct_source')
    if (error instanceof ProviderMembershipSourceConflictError)
      return terminalizeConflict(claim.id, claim.processingClaimToken, 'wrong_account')
    await defer(claim.id, claim.processingClaimToken, error)
  }
}
