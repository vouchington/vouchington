import { randomUUID } from 'node:crypto'
import { safeUsername } from './data.mts'
import { v7 } from 'uuid'
import { read, write } from '@data-stores/psql'
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

export async function supersedeVoteWeightFamilyObservation(sourceId: string): Promise<void> {
  const revision = randomUUID()
  const evidenceLookupSha256 = randomUUID().replaceAll('-', '').padEnd(64, 'd')
  const { rowCount } = await write(sql`/* supersedeVoteWeightFamilyObservation */
    WITH current_observation AS (
      SELECT observation.*
      FROM membership_source_states source_state
      INNER JOIN membership_provider_observations observation
        ON observation.id = source_state.membership_provider_observation_id
      WHERE source_state.membership_source_id = ${sourceId} AND source_state.source_kind = 'family'
    ), evidence AS (
      INSERT INTO membership_provider_evidence_records (
        membership_provider_context_id, provider, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      )
      SELECT membership_provider_context_id, 'stripe', membership_provider_lineage_id,
        ${evidenceLookupSha256}, ${Buffer.from([2])}, CURRENT_TIMESTAMP
      FROM current_observation
      RETURNING id
    ), newer_observation AS (
      INSERT INTO membership_provider_observations (
        membership_provider_context_id, membership_provider_evidence_record_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        provider_revision, provider_order, source_kind, effective_at, expires_at,
        should_auto_renew
      )
      SELECT current_observation.membership_provider_context_id, evidence.id,
        current_observation.membership_provider_lineage_id,
        current_observation.membership_provider_product_id,
        current_observation.membership_product_id,
        current_observation.observed_price_minor_units,
        current_observation.observed_price_currency_code,
        ${revision}, current_observation.provider_order + 1,
        current_observation.source_kind, current_observation.effective_at,
        current_observation.expires_at, current_observation.should_auto_renew
      FROM current_observation CROSS JOIN evidence
      RETURNING id
    )
    UPDATE membership_source_states source_state
    SET membership_provider_observation_id = newer_observation.id
    FROM newer_observation
    WHERE source_state.membership_source_id = ${sourceId}`)
  if (rowCount !== 1) throw new Error('Vote-weight family observation was not superseded')
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
      RETURNING membership_source_id, source_kind, membership_product_id, effective_at, expires_at
    )
    INSERT INTO memberships (user_id, membership_source_id, source_kind, membership_product_id, effective_at, expires_at)
    SELECT ${userId}, membership_source_id, source_kind, membership_product_id, effective_at, expires_at FROM state
    RETURNING membership_source_id AS id`)
  return rows[0]!.id
}
