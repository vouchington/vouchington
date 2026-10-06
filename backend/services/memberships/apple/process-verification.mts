import { deferClaimedMembershipVerification } from '../verification-work.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
import { claimPendingMembershipVerification } from '../verification-recovery.mts'
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
    await processClaimedAppleVerification(claim.id, claim.leaseToken, dependencies)
  } catch (err) {
    if (err instanceof AppleVerificationConflictError) {
      await terminalizeAppleVerification(claim.id, claim.leaseToken, 'conflict', err.reasonCode)
      return
    }
    if (err instanceof DirectMembershipSourceRejectedError) {
      await terminalizeAppleVerification(
        claim.id,
        claim.leaseToken,
        'conflict',
        'competing_direct_source',
      )
      return
    }
    await deferAppleVerification(claim.id, claim.leaseToken)
  }
}

async function processClaimedAppleVerification(
  verificationId: string,
  leaseToken: string,
  dependencies: AppleVerificationDependencies,
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getClaimedAppleVerification(verificationId, leaseToken, query)
  if (!context) return
  if (await finalizeAppleVerificationFromPriorAttempt(context, leaseToken, query)) {
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
    await rejectAndCommitAppleVerification(context, leaseToken, 'invalid_evidence', query)
    return
  }
  const mapping = await getAppleVerificationProduct(context, decoded.productId, query)
  if (!mapping) {
    await rejectAndCommitAppleVerification(context, leaseToken, 'wrong_product', query)
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
    await rejectAndCommitAppleVerification(context, leaseToken, result.reasonCode, query)
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
      await rejectAndCommitAppleVerification(context, leaseToken, 'wrong_account', query)
      return
    }
  } else if (context.purchaseIntentId) {
    await rejectAndCommitAppleVerification(context, leaseToken, 'wrong_account', query)
    return
  }
  await persistAndFinalizeAppleVerification(context, leaseToken, mapping, result.observation, query)
}

async function terminalizeAppleVerification(
  verificationId: string,
  leaseToken: string,
  disposition: 'conflict',
  reasonCode: 'competing_direct_source' | 'wrong_account',
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getClaimedAppleVerification(verificationId, leaseToken, query)
  if (!context) return
  await query(sql`/* acceptConflictedAppleVerificationEvidence */
    UPDATE membership_provider_evidence_records SET verified_at = CURRENT_TIMESTAMP
    WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  await finalizeAppleVerification(context, leaseToken, disposition, reasonCode, query)
  await query.commit()
}

async function deferAppleVerification(verificationId: string, leaseToken: string): Promise<void> {
  await deferClaimedMembershipVerification(verificationId, leaseToken, 'apple_verification_retry')
}
