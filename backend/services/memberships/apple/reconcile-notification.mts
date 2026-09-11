import { beginTransaction, read, write, type QueryExecutor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import type { ProcessAppleNotificationData } from '@queues/memberships/types'
import { projectVerifiedProviderMembershipObservation } from '@services/memberships/provider-observation-projection'
import sql from 'sql-template-strings'
import {
  createConfiguredAppleTransactionHistoryClient,
  fetchAppleTransactionHistory,
  getLatestAuthoritativeAppleTransaction,
  type AppleSubscriptionStatusClient,
  type AppleTransactionHistoryClient,
} from './history.mts'
import {
  createAppleNotificationVerifier,
  type AppleNotificationReconciliationVerifier,
} from './notification-verifier.mts'
import { acceptAndInsertAppleObservation } from './observation.mts'
import {
  getAppleProductMapping,
  getAppleProjectionContext,
  getApplePurchaseIntent,
  getProjectionUserId,
} from './notification-context.mts'
import type { AppleMembershipProviderEnvironment } from './types.mts'
import {
  fetchAppleSubscriptionStatuses,
  verifyAuthoritativeAppleSubscriptionStatus,
} from './subscription-status.mts'
import { verifyAppleNotification } from './verify-notification.mts'
import { verifyAppleSignedTransactionEvidence } from './verify-transaction.mts'

export async function reconcileAppleNotification(
  data: ProcessAppleNotificationData,
  dependencies: AppleNotificationReconciliationDependencies = {},
): Promise<void> {
  const evidence = await getAppleNotificationEvidence(data)
  if (!evidence || evidence.verified_at || evidence.rejected_at) return
  const verifier = (dependencies.createVerifier ?? createAppleNotificationVerifier)(evidence)
  const notification = await verifyAppleNotification({
    evidence: { signedPayload: decryptAppleEvidence(evidence) },
    ...evidence,
    verifier,
  })
  if (!notification || notification.providerLineageId !== data.providerLineageId) {
    await rejectAppleNotificationEvidence(data.evidenceId)
    return
  }
  const client = (dependencies.createClient ?? createConfiguredAppleTransactionHistoryClient)(
    evidence,
  )
  const history = await fetchAppleTransactionHistory(client, notification.providerLineageId)
  const latest = getLatestAuthoritativeAppleTransaction(history, notification.signedTransactionInfo)
  const statuses = await fetchAppleSubscriptionStatuses(client, notification.providerLineageId)
  await persistAppleNotificationObservation(
    data.evidenceId,
    latest.signedTransactionInfo,
    latest.providerOrder,
    statuses,
    verifier,
  )
}

type AppleNotificationReconciliationDependencies = {
  createClient?: (options: {
    applicationId: string
    environment: AppleMembershipProviderEnvironment
  }) => AppleTransactionHistoryClient & AppleSubscriptionStatusClient
  createVerifier?: (options: {
    applicationId: string
    environment: AppleMembershipProviderEnvironment
  }) => AppleNotificationReconciliationVerifier
}

type AppleNotificationEvidence = {
  applicationId: string
  encrypted_evidence: Buffer
  environment: AppleMembershipProviderEnvironment
  evidence_lookup_sha256: string
  membership_provider_lineage_id: string
  providerLineageId: string
  rejected_at: Date | null
  verified_at: Date | null
}

async function getAppleNotificationEvidence(
  data: ProcessAppleNotificationData,
): Promise<AppleNotificationEvidence | null> {
  const { rows } = await read(sql`/* reconcileAppleNotification.evidence */
    SELECT evidence.application_id AS "applicationId", evidence.encrypted_evidence,
      evidence.evidence_lookup_sha256, evidence.membership_provider_lineage_id,
      evidence.environment, evidence.verified_at, evidence.rejected_at,
      lineage.provider_lineage_id AS "providerLineageId"
    FROM membership_provider_evidence_records evidence
    INNER JOIN membership_provider_lineages lineage ON lineage.id = evidence.membership_provider_lineage_id
    WHERE evidence.id = ${data.evidenceId} AND evidence.provider = 'apple_app_store'
      AND evidence.environment = ${data.environment}`)
  return (rows[0] as AppleNotificationEvidence | undefined) ?? null
}

function decryptAppleEvidence(evidence: AppleNotificationEvidence): string {
  return decryptSecret(
    evidence.encrypted_evidence.toString(),
    `membership-provider-evidence:apple_app_store:${evidence.evidence_lookup_sha256}`,
  )
}

async function rejectAppleNotificationEvidence(
  evidenceId: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* reconcileAppleNotification.reject */
    UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP,
      rejection_reason = 'invalid_evidence'
    WHERE id = ${evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
}

async function persistAppleNotificationObservation(
  evidenceId: string,
  signedTransactionInfo: string,
  providerOrder: number,
  statuses: Awaited<ReturnType<typeof fetchAppleSubscriptionStatuses>>,
  verifier: ReturnType<typeof createAppleNotificationVerifier>,
): Promise<void> {
  await using query = await beginTransaction()
  const context = await getAppleProjectionContext(evidenceId, query)
  if (!context) throw new Error('Apple notification evidence context was not returned')
  const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
  const mapping = await getAppleProductMapping(context, decoded.productId, query)
  if (!mapping)
    throw new Error('Apple notification transaction has no active membership product mapping')
  const purchaseIntent = await getApplePurchaseIntent(
    decoded.appAccountToken,
    context,
    mapping.membershipProviderProductId,
    query,
  )
  const result = await verifyAppleSignedTransactionEvidence({
    evidence: { signed_transaction_info: signedTransactionInfo },
    expected: {
      ...context,
      expectedProduct: mapping,
      ...(purchaseIntent ? { purchaseIntentId: purchaseIntent.id } : {}),
    },
    verifier,
  })
  if (!result.accepted) {
    await rejectAppleNotificationEvidence(evidenceId, query)
    await query.commit()
    return
  }
  const status = await verifyAuthoritativeAppleSubscriptionStatus({
    expected: {
      applicationId: context.applicationId,
      environment: context.environment,
      providerLineageId: context.providerLineageId,
      providerProductId: mapping.providerProductId,
    },
    latestTransaction: decoded,
    statusResponse: statuses,
    verifier,
  })
  const observation = { ...result.observation, ...status }
  if (observation.sourceKind === 'direct' && !purchaseIntent) {
    await rejectAppleNotificationEvidence(evidenceId, query)
    await query.commit()
    return
  }
  if (observation.sourceKind === 'direct')
    await query(sql`/* reconcileAppleNotification.bindAccount */
      UPDATE membership_provider_lineages SET provider_account_id = ${observation.appAccountToken}
      WHERE id = ${context.lineageId} AND provider_account_id IS NULL`)
  const observationId = await acceptAndInsertAppleObservation(
    query,
    context,
    mapping,
    evidenceId,
    observation,
    providerOrder,
  )
  const userId = getProjectionUserId(observation.sourceKind, purchaseIntent)
  if (observationId && userId)
    await projectVerifiedProviderMembershipObservation(
      {
        userId,
        membershipProviderObservationId: observationId,
        sourceIdentity: {
          provider: 'apple_app_store',
          environment: context.environment,
          applicationId: context.applicationId,
          providerLineageId: context.providerLineageId,
          ...(observation.sourceKind === 'direct'
            ? { providerAccountId: observation.appAccountToken }
            : {}),
        },
      },
      { query },
    )
  await query.commit()
}
