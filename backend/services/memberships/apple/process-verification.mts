import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DirectMembershipSourceRejectedError } from '../direct-source-authority.mts'
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
  getPendingAppleVerification,
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
  try {
    await processPendingAppleVerification(verificationId, dependencies)
  } catch (err) {
    if (err instanceof AppleVerificationConflictError) {
      await terminalizeAppleVerification(verificationId, 'conflict', err.reasonCode)
      return
    }
    if (err instanceof DirectMembershipSourceRejectedError) {
      await terminalizeAppleVerification(verificationId, 'conflict', 'competing_direct_source')
      return
    }
    throw err
  }
}

async function processPendingAppleVerification(
  verificationId: string,
  dependencies: AppleVerificationDependencies,
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getPendingAppleVerification(verificationId, query)
  if (!context) return
  if (await finalizeAppleVerificationFromPriorAttempt(context, query)) {
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
    await rejectAndCommitAppleVerification(context, 'invalid_evidence', query)
    return
  }
  const mapping = await getAppleVerificationProduct(context, decoded.productId, query)
  if (!mapping) {
    await rejectAndCommitAppleVerification(context, 'wrong_product', query)
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
    await rejectAndCommitAppleVerification(context, result.reasonCode, query)
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
      await rejectAndCommitAppleVerification(context, 'wrong_account', query)
      return
    }
  } else if (context.purchaseIntentId) {
    await rejectAndCommitAppleVerification(context, 'wrong_account', query)
    return
  }
  await persistAndFinalizeAppleVerification(context, mapping, result.observation, query)
}

async function terminalizeAppleVerification(
  verificationId: string,
  disposition: 'conflict',
  reasonCode: 'competing_direct_source' | 'wrong_account',
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getPendingAppleVerification(verificationId, query)
  if (!context) return
  await query(sql`/* acceptConflictedAppleVerificationEvidence */
    UPDATE membership_provider_evidence_records SET verified_at = CURRENT_TIMESTAMP
    WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  await finalizeAppleVerification(context, disposition, reasonCode, query)
  await query.commit()
}
