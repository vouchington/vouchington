import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

type CreateTestUnprojectedStripeProductionProviderObservationOptions = {
  applicationId: string
  membershipProductId: string
  membershipProviderProductId: string
  userId: string
}

export async function createTestUnprojectedStripeProductionProviderObservation({
  applicationId,
  membershipProductId,
  membershipProviderProductId,
  userId,
}: CreateTestUnprojectedStripeProductionProviderObservationOptions): Promise<{
  membership_provider_evidence_id: string
  membership_provider_observation_id: string
}> {
  await using query = await beginTransaction()
  const providerLineageId = `sub_unprojected_${randomUUID()}`
  const { rows: lineageRows } =
    await query(sql`/* createTestUnprojectedStripeProductionProviderObservation: lineage */
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'production', ${applicationId}, ${providerLineageId})
      RETURNING id`)
  const lineage = lineageRows[0] as { id: string }
  const evidenceLookupSha256 = randomBytes(32).toString('hex')
  const { rows: evidenceRows } =
    await query(sql`/* createTestUnprojectedStripeProductionProviderObservation: evidence */
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) VALUES (
        'stripe', 'production', ${applicationId}, ${lineage.id},
        ${evidenceLookupSha256}, ${randomBytes(32)}, CURRENT_TIMESTAMP
      )
      RETURNING id`)
  const evidence = evidenceRows[0] as { id: string }
  const { rows: observationRows } =
    await query(sql`/* createTestUnprojectedStripeProductionProviderObservation: observation */
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        provider_revision, provider_order, source_kind, effective_at, auto_renews
      )
      SELECT
        'stripe', 'production', ${applicationId}, ${evidence.id}, ${lineage.id},
        provider_product.id, provider_product.membership_product_id,
        provider_product.price_minor_units, provider_product.currency_code,
        ${`test-${randomUUID()}`}, 0, 'direct', CURRENT_TIMESTAMP, false
      FROM membership_provider_products provider_product
      WHERE provider_product.id = ${membershipProviderProductId}
        AND provider_product.membership_product_id = ${membershipProductId}
        AND provider_product.provider = 'stripe'
        AND provider_product.environment = 'production'
        AND provider_product.application_id = ${applicationId}
      RETURNING id`)
  const observation = observationRows[0] as { id: string } | undefined
  if (!observation) throw new Error('Test Stripe provider product context was not found')
  const { rows: sourceRows } =
    await query(sql`/* createTestUnprojectedStripeProductionProviderObservation: source */
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      VALUES (${userId}, 'direct', ${lineage.id})
      RETURNING id`)
  const source = sourceRows[0] as { id: string }
  await query(sql`/* createTestUnprojectedStripeProductionProviderObservation: source state */
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_provider_lineage_id,
        membership_provider_observation_id, membership_product_id, effective_at
      ) VALUES (
        ${source.id}, 'direct', ${lineage.id}, ${observation.id},
        ${membershipProductId}, CURRENT_TIMESTAMP
      )`)
  const result = {
    membership_provider_evidence_id: evidence.id,
    membership_provider_observation_id: observation.id,
  }
  await query.commit()
  return result
}
