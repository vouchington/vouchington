import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipStatus } from '@voucha/types/entities/membership'
import { getLifecycleFields } from '../memberships-lifecycle.mts'

type CreateTestFamilyMembershipOptions = {
  applicationId: string
  effectiveAt?: Date
  expiresAt: Date
  membershipProductId: string
  membershipProviderProductId: string
  providerAccountId?: string
  sourceEffectiveAt?: Date
  sourceExpiresAt?: Date
  sourceStatus?: MembershipStatus
  userId: string
}

export async function createTestFamilyMembership({
  applicationId,
  effectiveAt = new Date(),
  expiresAt,
  membershipProductId,
  membershipProviderProductId,
  providerAccountId,
  sourceEffectiveAt = effectiveAt,
  sourceExpiresAt = expiresAt,
  sourceStatus = 'active',
  userId,
}: CreateTestFamilyMembershipOptions): Promise<{ id: string }> {
  const fixtureId = randomUUID()
  const evidenceLookupSha256 = fixtureId.replaceAll('-', '').padEnd(64, 'd')
  const sourceLifecycle = getLifecycleFields(sourceStatus, sourceEffectiveAt)
  const { rows } = await write(sql`/* createTestFamilyMembership */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id, provider_account_id
      ) VALUES (
        'stripe', 'production', ${applicationId}, ${`family-${fixtureId}`},
        ${providerAccountId ?? null}
      )
      RETURNING id
    ), evidence AS (
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) SELECT 'stripe', 'production', ${applicationId}, id,
        ${evidenceLookupSha256}, '\x01'::bytea, CURRENT_TIMESTAMP
      FROM lineage RETURNING id, membership_provider_lineage_id
    ), observation AS (
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        provider_revision, provider_order, source_kind, effective_at, expires_at, auto_renews
      ) SELECT 'stripe', 'production', ${applicationId}, evidence.id,
        evidence.membership_provider_lineage_id, provider_product.id,
        provider_product.membership_product_id, provider_product.price_minor_units,
        provider_product.currency_code, ${fixtureId}, 1, 'family',
        ${effectiveAt}, ${expiresAt}, true
      FROM evidence
      INNER JOIN membership_provider_products provider_product
        ON provider_product.id = ${membershipProviderProductId}
        AND provider_product.membership_product_id = ${membershipProductId}
        AND provider_product.provider = 'stripe'
        AND provider_product.environment = 'production'
        AND provider_product.application_id = ${applicationId}
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${userId}, 'family', membership_provider_lineage_id FROM observation
      RETURNING id, membership_provider_lineage_id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_provider_lineage_id,
        membership_provider_observation_id, membership_product_id,
        effective_at, expires_at, cancelled_at, expired_at, past_due_at, paused_at, auto_renews
      ) SELECT source.id, 'family', source.membership_provider_lineage_id,
        observation.id, ${membershipProductId}, ${sourceEffectiveAt}, ${sourceExpiresAt},
        ${sourceLifecycle.cancelledAt}, ${sourceLifecycle.expiredAt},
        ${sourceLifecycle.pastDueAt}, ${sourceLifecycle.pausedAt}, true
      FROM source CROSS JOIN observation
      RETURNING membership_source_id
    )
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at
    ) SELECT ${userId}, membership_source_id, ${membershipProductId}, ${effectiveAt},
      ${expiresAt} FROM state
    RETURNING id`)
  return rows[0] as { id: string }
}
