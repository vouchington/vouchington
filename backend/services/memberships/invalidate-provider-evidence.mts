import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChange } from './changes.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from './fallback/restore-after-current-access-ends.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction } from './grants/resume-after-direct-termination.mts'
type RejectedEvidenceTarget = {
  membership_id: string | null
  membership_product_id: string
  membership_source_id: string
  source_kind: 'direct' | 'family'
  user_id: string
}
// The evidence transition wins exactly once; its membership change owns the durable
// entitlement-effect outbox row.
export async function rejectMembershipProviderEvidence(
  evidenceId: string,
  reason: string,
  dependencies: {
    enqueueDeliverMembershipEntitlementEffects?: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort
  } = {},
): Promise<{ invalidated: boolean; membershipId: string | null }> {
  const rejectionReason = validateRejectionReason(reason)
  const enqueueEntitlementEffects =
    dependencies.enqueueDeliverMembershipEntitlementEffects ??
    enqueueDeliverMembershipEntitlementEffectsBestEffort
  await using transaction = await beginTransaction()
  const outcome = await rejectMembershipProviderEvidenceInTransaction(
    evidenceId,
    rejectionReason,
    transaction,
  )
  await transaction.commit()
  if (outcome.audited) void enqueueEntitlementEffects()
  return { invalidated: outcome.invalidated, membershipId: outcome.membershipId }
}
async function rejectMembershipProviderEvidenceInTransaction(
  evidenceId: string,
  rejectionReason: string,
  query: QueryExecutor,
): Promise<{ audited: boolean; invalidated: boolean; membershipId: string | null }> {
  const target = await getRejectedEvidenceTarget(evidenceId, query)
  if (!target)
    return rejectUnprojectedMembershipProviderEvidence(evidenceId, rejectionReason, query)

  await query(sql`/* rejectMembershipProviderEvidence: lock user */
    SELECT id FROM users WHERE id = ${target.user_id} FOR UPDATE`)
  const lockedTarget = await getRejectedEvidenceTarget(evidenceId, query, true)
  if (!lockedTarget)
    return rejectUnprojectedMembershipProviderEvidence(evidenceId, rejectionReason, query)
  const rejectedAt = await rejectVerifiedMembershipProviderEvidence(
    evidenceId,
    rejectionReason,
    query,
  )
  if (!rejectedAt) return { audited: false, invalidated: false, membershipId: null }

  await query(sql`/* rejectMembershipProviderEvidence: cancel source */
    UPDATE membership_source_states
    SET effective_at = LEAST(effective_at, ${rejectedAt}), cancelled_at = ${rejectedAt},
        expired_at = NULL, past_due_at = NULL, paused_at = NULL, auto_renews = false,
        updated_at = CURRENT_TIMESTAMP
    WHERE membership_source_id = ${lockedTarget.membership_source_id}
  `)
  if (!lockedTarget.membership_id) return { audited: false, invalidated: true, membershipId: null }
  const changeEvidenceId = await getUnclaimedEvidenceId(evidenceId, query)
  await cancelMembershipProjectionAndRecordRejection(
    lockedTarget,
    lockedTarget.membership_id,
    rejectedAt,
    rejectionReason,
    changeEvidenceId,
    query,
  )
  if (lockedTarget.source_kind === 'direct')
    await resumeGrantAfterDirectAccessSuspensionInTransaction(
      lockedTarget.user_id,
      lockedTarget.membership_id,
      query,
    )
  if (lockedTarget.source_kind === 'family')
    await restoreFallbackAfterCurrentAccessEndsInTransaction(
      lockedTarget.user_id,
      lockedTarget.membership_id,
      query,
    )
  await query(sql`/* rejectMembershipProviderEvidence: retire projection */
    UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${lockedTarget.membership_id} AND projection_ended_at IS NULL
  `)
  return { audited: true, invalidated: true, membershipId: lockedTarget.membership_id }
}

async function cancelMembershipProjectionAndRecordRejection(
  target: RejectedEvidenceTarget,
  membershipId: string,
  rejectedAt: Date,
  rejectionReason: string,
  evidenceId: string | null,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* rejectMembershipProviderEvidence: cancel projection */
    UPDATE memberships
    SET effective_at = LEAST(effective_at, ${rejectedAt}), cancelled_at = ${rejectedAt},
        expired_at = NULL, past_due_at = NULL, paused_at = NULL, cancel_at_period_end = false,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${membershipId} AND projection_ended_at IS NULL
  `)
  await recordMembershipChange({
    membershipId,
    userId: target.user_id,
    membershipSourceId: target.membership_source_id,
    changeType: 'cancellation',
    fromSkuId: target.membership_product_id,
    toSkuId: target.membership_product_id,
    cancelledAt: rejectedAt,
    note: rejectionReason,
    membershipProviderEvidenceId: evidenceId,
    query,
  })
}

async function getUnclaimedEvidenceId(
  evidenceId: string,
  query: QueryExecutor,
): Promise<string | null> {
  const { rows } = await query(sql`/* getUnclaimedMembershipChangeEvidenceId */
    SELECT evidence.id
    FROM membership_provider_evidence_records evidence
    WHERE evidence.id = ${evidenceId}
      AND NOT EXISTS (
        SELECT 1 FROM membership_changes membership_change
        WHERE membership_change.membership_provider_evidence_id = evidence.id
      )`)
  return (rows[0] as { id: string } | undefined)?.id ?? null
}

async function getRejectedEvidenceTarget(
  evidenceId: string,
  query: QueryExecutor,
  lock = false,
): Promise<RejectedEvidenceTarget | null> {
  const statement = sql`/* getRejectedEvidenceTarget */
    SELECT membership.id AS membership_id, source_state.membership_product_id,
      source.id AS membership_source_id, source.source_kind, source.user_id
    FROM membership_provider_evidence_records evidence
    INNER JOIN membership_provider_observations observation
      ON observation.membership_provider_evidence_id = evidence.id
    INNER JOIN membership_sources source
      ON source.membership_provider_lineage_id = observation.membership_provider_lineage_id
      AND source.source_kind = observation.source_kind
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
      AND source_state.membership_provider_lineage_id = observation.membership_provider_lineage_id
    LEFT JOIN LATERAL (
      SELECT id FROM memberships
      WHERE membership_source_id = source.id
      ORDER BY projection_ended_at IS NULL DESC, id DESC
      LIMIT 1
    ) membership ON true
    WHERE evidence.id = ${evidenceId}
      AND evidence.membership_provider_lineage_id = observation.membership_provider_lineage_id
    LIMIT 1`
  if (lock) statement.append(sql` FOR UPDATE OF evidence, source_state, source`)
  const { rows } = await query(statement)
  return (rows[0] as RejectedEvidenceTarget | undefined) ?? null
}

async function rejectUnprojectedMembershipProviderEvidence(
  evidenceId: string,
  rejectionReason: string,
  query: QueryExecutor,
): Promise<{ audited: false; invalidated: boolean; membershipId: null }> {
  const rejectedAt = await rejectVerifiedMembershipProviderEvidence(
    evidenceId,
    rejectionReason,
    query,
  )
  return { audited: false, invalidated: rejectedAt !== null, membershipId: null }
}

async function rejectVerifiedMembershipProviderEvidence(
  evidenceId: string,
  rejectionReason: string,
  query: QueryExecutor,
): Promise<Date | null> {
  const { rows } = await query(sql`/* rejectVerifiedMembershipProviderEvidence */
    UPDATE membership_provider_evidence_records
    SET verified_at = NULL, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ${rejectionReason}
    WHERE id = ${evidenceId} AND verified_at IS NOT NULL AND rejected_at IS NULL
    RETURNING rejected_at`)
  return (rows[0] as { rejected_at: Date } | undefined)?.rejected_at ?? null
}

function validateRejectionReason(reason: string): string {
  const rejectionReason = reason.trim()
  if (rejectionReason.length < 1 || rejectionReason.length > 1000)
    throw new RangeError('Rejection reason must be 1-1000 characters')
  return rejectionReason
}
