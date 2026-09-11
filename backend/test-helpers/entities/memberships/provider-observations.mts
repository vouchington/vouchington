import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestProviderObservationLifecycle } from './provider-observation-lifecycle.mts'

type AttachTestStripeProductionProviderObservationOptions = {
  membership_id: string
  membership_provider_product_id: string
  auto_renews?: boolean
  status?: 'active'
  renewal_membership_provider_product_id?: string
  renewal_effective_at?: Date
}

type StripeProductionObservationTarget = {
  application_id: string
  effective_at: Date
  expires_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  membership_product_id: string
  membership_provider_lineage_id: string
  membership_source_id: string
  observed_price_minor_units: string
  observed_price_currency_code: string
  renewal_membership_product_id: string | null
  renewal_price_minor_units: string | null
  renewal_price_currency_code: string | null
}

type TestMembershipProviderObservation = {
  membership_provider_product_id: string
  observed_price_minor_units: string
  provider_order: string
  provider_revision: string
  terminal_at: Date | null
  expired_at: Date | null
  paused_at: Date | null
  observed_price_currency_code: string
  renewal_price_minor_units: string | null
  renewal_price_currency_code: string | null
  renewal_membership_provider_product_id: string | null
  renewal_membership_product_id: string | null
  renewal_effective_at: Date | null
}

export async function attachTestStripeProductionProviderObservation(
  options: AttachTestStripeProductionProviderObservationOptions,
): Promise<{
  membership_provider_evidence_id: string
  membership_provider_observation_id: string
}> {
  if (
    (options.renewal_membership_provider_product_id === undefined) !==
    (options.renewal_effective_at === undefined)
  ) {
    throw new Error('Renewal provider product and effective time must be provided together')
  }

  await using transaction = await beginTransaction()
  const query = transaction
  const { rows: targetRows } =
    await query(sql`/* attachTestStripeProductionProviderObservation: target */
      SELECT
        provider_product.application_id,
        source_state.effective_at,
        source_state.expires_at,
        source_state.cancelled_at,
        source_state.expired_at,
        source_state.past_due_at,
        source_state.paused_at,
        source_state.membership_product_id,
        source_state.membership_provider_lineage_id,
        source_state.membership_source_id,
        provider_product.price_minor_units AS observed_price_minor_units,
        provider_product.currency_code AS observed_price_currency_code,
        renewal_product.membership_product_id AS renewal_membership_product_id,
        renewal_product.price_minor_units AS renewal_price_minor_units,
        renewal_product.currency_code AS renewal_price_currency_code
      FROM memberships membership
      INNER JOIN membership_sources source
        ON source.id = membership.membership_source_id
        AND source.source_kind = 'direct'
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = source.id
        AND source_state.source_kind = source.source_kind
        AND source_state.membership_provider_lineage_id = source.membership_provider_lineage_id
        AND source_state.membership_product_id = membership.membership_product_id
      INNER JOIN membership_provider_lineages lineage
        ON lineage.id = source.membership_provider_lineage_id
        AND lineage.provider = 'stripe'
        AND lineage.environment = 'production'
      INNER JOIN membership_provider_products provider_product
        ON provider_product.id = ${options.membership_provider_product_id}
        AND provider_product.membership_product_id = source_state.membership_product_id
        AND provider_product.provider = lineage.provider
        AND provider_product.environment = lineage.environment
        AND provider_product.application_id = lineage.application_id
      LEFT JOIN membership_provider_products renewal_product
        ON renewal_product.id = ${options.renewal_membership_provider_product_id ?? null}
        AND renewal_product.provider = lineage.provider
        AND renewal_product.environment = lineage.environment
        AND renewal_product.application_id = lineage.application_id
      WHERE membership.id = ${options.membership_id}
      FOR UPDATE OF source_state`)
  const target = targetRows[0] as StripeProductionObservationTarget | undefined
  if (!target) {
    throw new Error(
      'Membership must have a direct Stripe production source matching the provider product context',
    )
  }
  if (options.renewal_membership_provider_product_id && !target.renewal_membership_product_id) {
    throw new Error('Renewal provider product must match the membership provider context')
  }

  const evidenceLookupSha256 = randomBytes(32).toString('hex')
  const encryptedEvidence = randomBytes(32)
  const lifecycle = getTestProviderObservationLifecycle(options.status, target)
  const { rows: evidenceRows } =
    await query(sql`/* attachTestStripeProductionProviderObservation: evidence */
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) VALUES (
        'stripe', 'production', ${target.application_id},
        ${target.membership_provider_lineage_id}, ${evidenceLookupSha256},
        ${encryptedEvidence}, CURRENT_TIMESTAMP
      )
      RETURNING id`)
  const evidence = evidenceRows[0] as { id: string }
  const autoRenews = options.auto_renews ?? true
  const { rows: observationRows } =
    await query(sql`/* attachTestStripeProductionProviderObservation: observation */
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        renewal_membership_provider_product_id, renewal_membership_product_id,
        renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
        provider_revision, provider_order, source_kind,
        effective_at, expires_at, cancelled_at, expired_at, past_due_at, paused_at, auto_renews
      ) VALUES (
        'stripe', 'production', ${target.application_id}, ${evidence.id},
        ${target.membership_provider_lineage_id}, ${options.membership_provider_product_id},
        ${target.membership_product_id}, ${target.observed_price_minor_units},
        ${target.observed_price_currency_code},
        ${options.renewal_membership_provider_product_id ?? null},
        ${target.renewal_membership_product_id}, ${target.renewal_price_minor_units},
        ${target.renewal_price_currency_code}, ${options.renewal_effective_at ?? null},
        ${`test-${randomUUID()}`}, 0, 'direct',
        ${target.effective_at}, ${target.expires_at}, ${lifecycle.cancelledAt},
        ${lifecycle.expiredAt}, ${lifecycle.pastDueAt}, ${lifecycle.pausedAt}, ${autoRenews}
      )
      RETURNING id`)
  const observation = observationRows[0] as { id: string }
  await query(sql`/* attachTestStripeProductionProviderObservation: source state */
      UPDATE membership_source_states
      SET membership_provider_observation_id = ${observation.id},
        cancelled_at = ${lifecycle.cancelledAt}, expired_at = ${lifecycle.expiredAt},
        past_due_at = ${lifecycle.pastDueAt}, paused_at = ${lifecycle.pausedAt},
        auto_renews = ${autoRenews},
        updated_at = CURRENT_TIMESTAMP
      WHERE membership_source_id = ${target.membership_source_id}`)
  const result = {
    membership_provider_evidence_id: evidence.id,
    membership_provider_observation_id: observation.id,
  }
  await transaction.commit()
  return result
}

export async function getTestMembershipProviderObservation(
  observationId: string,
): Promise<TestMembershipProviderObservation | undefined> {
  const { rows } = await read(sql`/* getTestMembershipProviderObservation */
    SELECT membership_provider_product_id, observed_price_minor_units, provider_order, provider_revision, terminal_at,
      expired_at, paused_at, observed_price_currency_code, renewal_price_minor_units,
      renewal_price_currency_code, renewal_membership_provider_product_id, renewal_membership_product_id,
      renewal_effective_at
    FROM membership_provider_observations WHERE id = ${observationId}`)
  return rows[0] as TestMembershipProviderObservation | undefined
}
