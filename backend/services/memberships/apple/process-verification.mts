import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
import {
  claimPendingMembershipVerification,
  deferMembershipVerificationUntilAdapterAvailable,
} from '../verification-recovery.mts'
import { createConfiguredAppleTransactionVerifier } from './configured-verifier.mts'
import {
  AppleVerificationConflictError,
  finalizeAppleVerification,
  finalizeAppleVerificationFromPriorAttempt,
} from './process-verification-finalize.mts'
import {
  decryptAppleVerificationEvidence,
  getAppleVerificationProduct,
  getAppleVerificationPurchaseIntent,
  getClaimedAppleVerification,
} from './process-verification-context.mts'
import {
  persistAndFinalizeAppleVerification,
  rejectAndCommitAppleVerification,
} from './process-verification-project.mts'
import { verifyAppleSignedTransactionEvidence } from './verify-transaction.mts'

type AppleVerificationDependencies = {
  createVerifier?: typeof createConfiguredAppleTransactionVerifier
}

export async function processAppleMembershipVerification(
  verificationId: string,
  dependencies: AppleVerificationDependencies = {},
): Promise<void> {
  const claim = await claimPendingMembershipVerification(verificationId)
  if (!claim) return
  try {
    await processClaimedAppleVerification(claim.id, claim.processingClaimToken, dependencies)
  } catch (error) {
    if (error instanceof AppleVerificationConflictError) {
      await terminalizeAppleVerification(
        claim.id,
        claim.processingClaimToken,
        'conflict',
        error.reasonCode,
      )
      return
    }
    if (error instanceof DirectMembershipSourceRejectedError) {
      await terminalizeAppleVerification(
        claim.id,
        claim.processingClaimToken,
        'conflict',
        'competing_direct_source',
      )
      return
    }
    await deferAppleVerification(claim.id, claim.processingClaimToken)
  }
}

export async function processMembershipVerification(
  verificationId: string,
  dependencies: AppleVerificationDependencies = {},
): Promise<void> {
  const { rows } = await read<{ provider: string }>(sql`/* processMembershipVerification.provider */
    SELECT provider FROM membership_verifications WHERE id = ${verificationId} LIMIT 1`)
  if (rows[0]?.provider === 'apple_app_store')
    return processAppleMembershipVerification(verificationId, dependencies)
  await deferMembershipVerificationUntilAdapterAvailable(verificationId)
}

async function processClaimedAppleVerification(
  verificationId: string,
  processingClaimToken: string,
  dependencies: AppleVerificationDependencies,
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getClaimedAppleVerification(verificationId, processingClaimToken, query)
  if (!context) return
  if (await finalizeAppleVerificationFromPriorAttempt(context, processingClaimToken, query)) {
    await query.commit()
    return
  }
  const evidence = decryptAppleVerificationEvidence(
    context.encryptedEvidence,
    context.evidenceLookupSha256,
  )
  const verifier = (dependencies.createVerifier ?? createConfiguredAppleTransactionVerifier)({
    applicationId: context.applicationId,
    environment: context.environment,
  })
  let decoded: { productId?: string }
  try {
    decoded = await verifier.verifyAndDecodeTransaction(evidence.signed_transaction_info)
  } catch {
    await rejectAndCommitAppleVerification(context, processingClaimToken, 'invalid_evidence', query)
    return
  }
  const mapping = await getAppleVerificationProduct(context, decoded.productId, query)
  if (!mapping) {
    await rejectAndCommitAppleVerification(context, processingClaimToken, 'wrong_product', query)
    return
  }
  const result = await verifyAppleSignedTransactionEvidence({
    evidence,
    expected: {
      applicationId: context.applicationId,
      environment: context.environment,
      expectedProduct: mapping,
      ...(context.purchaseIntentId ? { purchaseIntentId: context.purchaseIntentId } : {}),
    },
    verifier,
  })
  if (!result.accepted) {
    await rejectAndCommitAppleVerification(context, processingClaimToken, result.reasonCode, query)
    return
  }
  if (result.observation.sourceKind === 'direct') {
    if (
      !(await getAppleVerificationPurchaseIntent(
        context,
        result.observation.appAccountToken,
        mapping,
        query,
      ))
    ) {
      await rejectAndCommitAppleVerification(context, processingClaimToken, 'wrong_account', query)
      return
    }
  } else if (context.purchaseIntentId) {
    await rejectAndCommitAppleVerification(context, processingClaimToken, 'wrong_account', query)
    return
  }
  await persistAndFinalizeAppleVerification(
    context,
    processingClaimToken,
    mapping,
    result.observation,
    query,
  )
}

async function terminalizeAppleVerification(
  verificationId: string,
  processingClaimToken: string,
  disposition: 'conflict',
  reasonCode: 'competing_direct_source' | 'wrong_account',
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getClaimedAppleVerification(verificationId, processingClaimToken, query)
  if (!context) return
  await query(sql`/* acceptConflictedAppleVerificationEvidence */
    UPDATE membership_provider_evidence_records SET verified_at = CURRENT_TIMESTAMP
    WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  await finalizeAppleVerification(context, processingClaimToken, disposition, reasonCode, query)
  await query.commit()
}

async function deferAppleVerification(
  verificationId: string,
  processingClaimToken: string,
): Promise<void> {
  await write(sql`/* deferAppleVerification */
    UPDATE membership_verifications SET processing_claim_token = NULL, processing_claimed_at = NULL,
      next_processing_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', last_error = 'apple_verification_retry'
    WHERE id = ${verificationId} AND processing_claim_token = ${processingClaimToken}
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
}
