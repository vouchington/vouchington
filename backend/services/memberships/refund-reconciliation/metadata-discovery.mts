import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  assertPageCursor,
  findOperationRefund,
  scanStateFromPage,
} from './metadata-discovery-page.mts'
import type { RefundReconciliationAttempt } from './types.mts'

const PROVIDER_PAGE_BUDGET = 3

export type MetadataDiscoverableRefund = {
  id: string
  metadata?: Record<string, string> | null
}

export type RefundMetadataPage = {
  hasMore: boolean
  nextCursor: string | null
  refunds: MetadataDiscoverableRefund[]
}

export type RefundMetadataScanState = {
  completedAt: Date | null
  nextProviderRefundId: string | null
  stableHeadProviderRefundId: string | null
}

export type RefundMetadataDiscoveryResult =
  | { outcome: 'found'; refund: MetadataDiscoverableRefund }
  | { outcome: 'pending' }
  | { outcome: 'not_found' }

/**
 * Finds a refund written with this operation's metadata without risking a second provider create.
 * A scan only becomes authoritative after a fresh head read matches the persisted initial head.
 */
export async function discoverRefundByOperationMetadata(
  attempt: RefundReconciliationAttempt,
  leaseToken: string,
  lookup: { chargeId: string | null; paymentIntentId: string | null },
  listPage: (options: {
    chargeId: string | null
    paymentIntentId: string | null
    startingAfter?: string
  }) => Promise<RefundMetadataPage>,
): Promise<RefundMetadataDiscoveryResult> {
  const state = await getRefundMetadataScanState(attempt.id)
  if (state?.completedAt) return { outcome: 'not_found' }
  return advanceRefundMetadataScan(
    attempt,
    leaseToken,
    lookup,
    listPage,
    state,
    PROVIDER_PAGE_BUDGET,
  )
}

async function advanceRefundMetadataScan(
  attempt: RefundReconciliationAttempt,
  leaseToken: string,
  lookup: { chargeId: string | null; paymentIntentId: string | null },
  listPage: Parameters<typeof discoverRefundByOperationMetadata>[3],
  state: RefundMetadataScanState | null,
  pagesRemaining: number,
): Promise<RefundMetadataDiscoveryResult> {
  if (pagesRemaining === 0) return { outcome: 'pending' }
  if (!state) return startRefundMetadataScan(attempt, leaseToken, lookup, listPage, pagesRemaining)
  if (state.nextProviderRefundId)
    return resumeRefundMetadataScan(attempt, leaseToken, lookup, listPage, state, pagesRemaining)
  return verifyRefundMetadataScanHead(attempt, leaseToken, lookup, listPage, state, pagesRemaining)
}

async function startRefundMetadataScan(
  attempt: RefundReconciliationAttempt,
  leaseToken: string,
  lookup: { chargeId: string | null; paymentIntentId: string | null },
  listPage: Parameters<typeof discoverRefundByOperationMetadata>[3],
  pagesRemaining: number,
): Promise<RefundMetadataDiscoveryResult> {
  const page = await listPage(lookup)
  assertPageCursor(page)
  const found = findOperationRefund(page.refunds, attempt)
  if (found) return { outcome: 'found', refund: found }
  const state = scanStateFromPage(page)
  await saveRefundMetadataScanState(attempt.id, leaseToken, state)
  return advanceRefundMetadataScan(attempt, leaseToken, lookup, listPage, state, pagesRemaining - 1)
}

async function resumeRefundMetadataScan(
  attempt: RefundReconciliationAttempt,
  leaseToken: string,
  lookup: { chargeId: string | null; paymentIntentId: string | null },
  listPage: Parameters<typeof discoverRefundByOperationMetadata>[3],
  state: RefundMetadataScanState,
  pagesRemaining: number,
): Promise<RefundMetadataDiscoveryResult> {
  const page = await listPage({ ...lookup, startingAfter: state.nextProviderRefundId! })
  assertPageCursor(page, state.nextProviderRefundId!)
  const found = findOperationRefund(page.refunds, attempt)
  if (found) return { outcome: 'found', refund: found }
  const nextState = {
    completedAt: null,
    nextProviderRefundId: page.hasMore ? page.nextCursor : null,
    stableHeadProviderRefundId: state.stableHeadProviderRefundId,
  }
  await saveRefundMetadataScanState(attempt.id, leaseToken, nextState)
  return advanceRefundMetadataScan(
    attempt,
    leaseToken,
    lookup,
    listPage,
    nextState,
    pagesRemaining - 1,
  )
}

async function verifyRefundMetadataScanHead(
  attempt: RefundReconciliationAttempt,
  leaseToken: string,
  lookup: { chargeId: string | null; paymentIntentId: string | null },
  listPage: Parameters<typeof discoverRefundByOperationMetadata>[3],
  state: RefundMetadataScanState,
  pagesRemaining: number,
): Promise<RefundMetadataDiscoveryResult> {
  const page = await listPage(lookup)
  assertPageCursor(page)
  const found = findOperationRefund(page.refunds, attempt)
  if (found) return { outcome: 'found', refund: found }
  const freshHead = page.refunds[0]?.id ?? null
  if (freshHead === state.stableHeadProviderRefundId) {
    await completeRefundMetadataScan(attempt.id, leaseToken)
    return { outcome: 'not_found' }
  }
  const restartedState = scanStateFromPage(page)
  await saveRefundMetadataScanState(attempt.id, leaseToken, restartedState)
  return advanceRefundMetadataScan(
    attempt,
    leaseToken,
    lookup,
    listPage,
    restartedState,
    pagesRemaining - 1,
  )
}

export async function getRefundMetadataScanState(
  attemptId: string,
): Promise<RefundMetadataScanState | null> {
  const { rows } = await write(sql`/* getRefundMetadataScanState */
    SELECT stable_head_provider_refund_id AS "stableHeadProviderRefundId",
      next_provider_refund_id AS "nextProviderRefundId", completed_at AS "completedAt"
    FROM membership_refund_operation_attempt_metadata_scans
    WHERE membership_refund_operation_attempt_id = ${attemptId}
  `)
  return (rows[0] as RefundMetadataScanState | undefined) ?? null
}

async function saveRefundMetadataScanState(
  attemptId: string,
  leaseToken: string,
  state: Omit<RefundMetadataScanState, 'completedAt'> & { completedAt: null },
): Promise<void> {
  await write(sql`/* saveRefundMetadataScanState */
    INSERT INTO membership_refund_operation_attempt_metadata_scans (
      membership_refund_operation_attempt_id, stable_head_provider_refund_id, next_provider_refund_id,
      lease_token
    ) VALUES (
      ${attemptId}, ${state.stableHeadProviderRefundId}, ${state.nextProviderRefundId}, ${leaseToken}
    ) ON CONFLICT (membership_refund_operation_attempt_id) DO UPDATE
    SET stable_head_provider_refund_id = EXCLUDED.stable_head_provider_refund_id,
      next_provider_refund_id = EXCLUDED.next_provider_refund_id,
      lease_token = EXCLUDED.lease_token,
      completed_at = NULL
  `)
}

async function completeRefundMetadataScan(attemptId: string, leaseToken: string): Promise<void> {
  await write(sql`/* completeRefundMetadataScan */
    UPDATE membership_refund_operation_attempt_metadata_scans
    SET completed_at = CURRENT_TIMESTAMP, next_provider_refund_id = NULL
    WHERE membership_refund_operation_attempt_id = ${attemptId}
      AND lease_token = ${leaseToken}
      AND completed_at IS NULL
  `)
}
