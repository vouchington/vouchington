import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipStatus } from '@voucha/types/entities/membership'

type CreateTestFamilyMembershipOptions = {
  applicationId: string
  effectiveAt?: Date
  expiresAt: Date | null
  membershipProductId: string
  membershipProviderProductId: string
  providerAccountId?: string
  sourceEffectiveAt?: Date
  sourceExpiresAt?: Date | null
  sourceUpdatedAt?: Date
  sourceStatus?: MembershipStatus
  userId: string
}

export async function createTestFamilyMembership({
  applicationId,
  effectiveAt,
  expiresAt,
  membershipProductId,
  membershipProviderProductId,
  providerAccountId,
  sourceEffectiveAt = effectiveAt,
  sourceExpiresAt,
  sourceStatus = 'active',
  sourceUpdatedAt,
  userId,
}: CreateTestFamilyMembershipOptions): Promise<{ id: string }> {
  const resolvedSourceExpiresAt = sourceExpiresAt !== undefined ? sourceExpiresAt : expiresAt
  const fixtureId = randomUUID()
  const evidenceLookupSha256 = fixtureId.replaceAll('-', '').padEnd(64, 'd')
  const { rows } = await write(sql`/* createTestFamilyMembership */
    WITH timing AS (
      SELECT COALESCE(${effectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP) AS effective_at,
        COALESCE(${sourceEffectiveAt ?? null}::timestamptz,
          ${effectiveAt ?? null}::timestamptz, CURRENT_TIMESTAMP) AS source_effective_at,
        COALESCE(${sourceUpdatedAt ?? null}::timestamptz, CURRENT_TIMESTAMP) AS source_updated_at
    ), provider_context AS (
      SELECT fn_upsert_membership_provider_context_id('stripe', 'production', ${applicationId}) AS id
    ), lineage AS (
      INSERT INTO membership_provider_lineages (
        membership_provider_context_id, provider_lineage_id, provider_account_id
      ) SELECT id, ${`family-${fixtureId}`}, ${providerAccountId ?? null} FROM provider_context
      RETURNING id
    ), evidence AS (
      INSERT INTO membership_provider_evidence_records (
        membership_provider_context_id, provider, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) SELECT provider_context.id, 'stripe', lineage.id,
        ${evidenceLookupSha256}, '\x01'::bytea, CURRENT_TIMESTAMP
      FROM lineage CROSS JOIN provider_context RETURNING id, membership_provider_lineage_id
    ), observation AS (
      INSERT INTO membership_provider_observations (
        membership_provider_context_id, membership_provider_evidence_record_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        provider_revision, provider_order, source_kind, effective_at, expires_at, should_auto_renew
      ) SELECT provider_product.membership_provider_context_id, evidence.id,
        evidence.membership_provider_lineage_id, provider_product.id,
        provider_product.membership_product_id, provider_product.price_minor_units,
        provider_product.currency_code, ${fixtureId}, 1, 'family',
        timing.effective_at, ${expiresAt}, true
      FROM evidence CROSS JOIN timing
      INNER JOIN membership_provider_products provider_product
        ON provider_product.id = ${membershipProviderProductId}
        AND provider_product.membership_product_id = ${membershipProductId}
        AND provider_product.membership_provider_context_id = (SELECT id FROM provider_context)
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${userId}, 'family', membership_provider_lineage_id FROM observation
      RETURNING id, membership_provider_lineage_id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_provider_lineage_id,
        membership_provider_observation_id, membership_product_id,
        effective_at, expires_at, cancelled_at, expired_at, past_due_at, paused_at, should_auto_renew, updated_at
      ) SELECT source.id, 'family', source.membership_provider_lineage_id,
        observation.id, ${membershipProductId}, timing.source_effective_at, ${resolvedSourceExpiresAt},
        CASE WHEN ${sourceStatus} = 'cancelled' THEN timing.source_effective_at END,
        CASE WHEN ${sourceStatus} = 'expired' THEN timing.source_effective_at END,
        CASE WHEN ${sourceStatus} = 'past_due' THEN timing.source_effective_at END,
        CASE WHEN ${sourceStatus} = 'paused' THEN timing.source_effective_at END,
        true, timing.source_updated_at
      FROM source CROSS JOIN observation CROSS JOIN timing
      RETURNING membership_source_id
    )
    INSERT INTO memberships (
      user_id, membership_source_id, source_kind, membership_product_id, effective_at, expires_at
    ) SELECT ${userId}, membership_source_id, 'family', ${membershipProductId}, timing.effective_at,
      ${expiresAt} FROM state CROSS JOIN timing
    RETURNING id`)
  return rows[0] as { id: string }
}
