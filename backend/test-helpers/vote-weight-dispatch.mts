import { randomUUID } from 'node:crypto'
import { safeUsername } from './data.mts'
import { v7 } from 'uuid'
import { read, write, beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from './entities/users.mts'
import { createTestUserWithId } from './entities/users-direct.mts'
import { createTestSku } from './entities/memberships.mts'
import { createTestFamilyMembership } from './entities/memberships/family.mts'

export async function createVoteWeightDispatchUser() {
  return createTestUserDirect({ username: safeUsername('vw-dispatch') })
}

export async function createVoteWeightDispatchUserAt(at: Date): Promise<string> {
  const id = v7({ msecs: at.getTime() })
  await createTestUserWithId(id, safeUsername('vw-dispatch'))
  return id
}

export async function createVoteWeightDispatchFamily(options: {
  userId: string
  effectiveAt: Date
  expiresAt: Date
  updatedAt: Date
}) {
  const sku = await createTestSku({ provider_application_id: `vw-dispatch-${randomUUID()}` })
  const membership = await createTestFamilyMembership({
    userId: options.userId,
    applicationId: sku.provider_application_id,
    membershipProductId: sku.id,
    membershipProviderProductId: sku.membership_provider_product_id,
    effectiveAt: options.effectiveAt,
    expiresAt: options.expiresAt,
    sourceUpdatedAt: options.updatedAt,
  })
  const { rows } = await read<{
    source_id: string
    evidence_id: string
  }>(sql`/* createVoteWeightDispatchFamily: ids */
    SELECT membership.membership_source_id AS source_id,
      observation.membership_provider_evidence_record_id AS evidence_id
    FROM memberships membership
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = membership.membership_source_id
    INNER JOIN membership_provider_observations observation
      ON observation.id = source_state.membership_provider_observation_id
    WHERE membership.id = ${membership.id}`)
  const ids = rows[0]
  if (!ids) throw new Error('Vote-weight family fixture missing source or evidence')
  return { membershipId: membership.id, sourceId: ids.source_id, evidenceId: ids.evidence_id }
}

export async function setVoteWeightMembershipExpiryExact(membershipId: string, at: string) {
  await write(sql`/* setVoteWeightMembershipExpiryExact */
    UPDATE memberships SET expires_at = ${at}::timestamptz
    WHERE id = ${membershipId}`)
}

export async function rejectVoteWeightEvidenceExact(evidenceId: string, at: string) {
  await write(sql`/* rejectVoteWeightEvidenceExact */
    UPDATE membership_provider_evidence_records
    SET verified_at = NULL, rejected_at = ${at}::timestamptz,
      rejection_reason = 'vote-weight dispatcher test'
    WHERE id = ${evidenceId}`)
}

export async function getVoteWeightEvidenceRejectedAtExact(evidenceId: string): Promise<string> {
  const { rows } = await read<{ at: string }>(sql`/* getVoteWeightEvidenceRejectedAtExact */
    SELECT rejected_at::text AS at FROM membership_provider_evidence_records
    WHERE id = ${evidenceId} AND rejected_at IS NOT NULL`)
  if (!rows[0]) throw new Error('Vote-weight family evidence was not rejected')
  return rows[0].at
}

export async function getVoteWeightDispatchCursorForTest(
  dispatcher: string,
): Promise<string | null> {
  const { rows } = await read<{ at: string | null }>(sql`/* getVoteWeightDispatchCursorForTest */
    SELECT changes_through_at::text AS at FROM vote_weight_recalculation_cursors
    WHERE dispatcher = ${dispatcher}`)
  return rows[0]?.at ?? null
}

export async function withVoteWeightDispatchCursorForTest(
  dispatcher: string,
  run: (previousThroughAt: string | null, query: QueryExecutor) => Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* withVoteWeightDispatchCursorForTest */
    INSERT INTO vote_weight_recalculation_cursors (dispatcher)
    VALUES (${dispatcher}) ON CONFLICT DO NOTHING`)
  const { rows } = await transaction<{
    at: string | null
  }>(sql`/* withVoteWeightDispatchCursorForTest */
    SELECT changes_through_at::text AS at FROM vote_weight_recalculation_cursors
    WHERE dispatcher = ${dispatcher} FOR UPDATE`)
  await run(rows[0]?.at ?? null, transaction)
}

export async function readVoteWeightDispatchCursorForTest(
  dispatcher: string,
  query: QueryExecutor,
) {
  const { rows } = await query<{ at: string | null }>(sql`/* readVoteWeightDispatchCursorForTest */
    SELECT changes_through_at::text AS at FROM vote_weight_recalculation_cursors WHERE dispatcher = ${dispatcher}`)
  return rows[0]?.at ?? null
}

export async function addVoteWeightSharedFamilyRecipient(sourceId: string, userId: string) {
  const { rows } = await write<{ id: string }>(sql`/* addVoteWeightSharedFamilyRecipient */
    WITH source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${userId}, source_kind, membership_provider_lineage_id FROM membership_sources WHERE id = ${sourceId}
      RETURNING id
    ), state AS (
      INSERT INTO membership_source_states (membership_source_id, source_kind, membership_provider_lineage_id,
        membership_provider_observation_id, membership_product_id, effective_at, expires_at)
      SELECT source.id, template.source_kind, template.membership_provider_lineage_id,
        template.membership_provider_observation_id, template.membership_product_id, template.effective_at, template.expires_at
      FROM source CROSS JOIN membership_source_states template WHERE template.membership_source_id = ${sourceId}
      RETURNING membership_source_id, membership_product_id, effective_at, expires_at
    )
    INSERT INTO memberships (user_id, membership_source_id, membership_product_id, effective_at, expires_at)
    SELECT ${userId}, membership_source_id, membership_product_id, effective_at, expires_at FROM state
    RETURNING membership_source_id AS id`)
  return rows[0]!.id
}
