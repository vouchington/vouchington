import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('membership provider observation schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects partial, backwards-effective, and cross-kind observation state', async () => {
    const suffix = randomUUID()
    const applicationId = `schema-observation-${suffix}`
    const userId = randomUUID()
    const { rows: productRows } = await read<{ id: string }>(`
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
    const productId = productRows[0]!.id
    const { rows: mappingRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_products (
        membership_product_id, provider, environment, application_id,
        provider_product_id, price_minor_units, currency_code
      ) VALUES (${productId}, 'stripe', 'test', ${applicationId},
        ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
    const { rows: lineageRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`}) RETURNING id`)
    const lineageId = lineageRows[0]!.id
    const { rows: evidenceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) VALUES ('stripe', 'test', ${applicationId}, ${lineageId},
        ${suffix.replaceAll('-', '').padEnd(64, 'c')}, '\x01'::bytea, CURRENT_TIMESTAMP)
      RETURNING id`)
    const evidenceId = evidenceRows[0]!.id
    const mappingId = mappingRows[0]!.id

    const { rows: priceOptionalEvidenceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) VALUES ('stripe', 'test', ${applicationId}, ${lineageId},
        ${randomUUID().replaceAll('-', '').padEnd(64, 'f')}, '\x04'::bytea,
        CURRENT_TIMESTAMP)
      RETURNING id`)
    await expect(
      write(sql`/* allowObservationWithoutKnownPrice */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, provider_revision, provider_order, source_kind, effective_at
        ) VALUES ('stripe', 'test', ${applicationId}, ${priceOptionalEvidenceRows[0]!.id},
          ${lineageId}, ${mappingId}, ${productId}, 'price-optional', 0, 'direct',
          CURRENT_TIMESTAMP)`),
    ).resolves.toMatchObject({ rowCount: 1 })

    await expect(
      write(sql`/* rejectPartialRenewalSnapshot */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          renewal_membership_provider_product_id, provider_revision, provider_order,
          source_kind, effective_at, auto_renews
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId},
          ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, 'partial', 1,
          'direct', CURRENT_TIMESTAMP, true)`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* rejectBackwardsRenewalEffectiveTime */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          renewal_membership_provider_product_id, renewal_membership_product_id,
          renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
          provider_revision, provider_order, source_kind, effective_at, auto_renews
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId},
          ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, ${productId}, 200, 'usd',
          CURRENT_TIMESTAMP, 'backwards', 2, 'direct', CURRENT_TIMESTAMP + INTERVAL '1 day', true)`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: observationRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        provider_revision, provider_order, source_kind, effective_at
      ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId},
        ${mappingId}, ${productId}, 100, 'usd', 'family', 3, 'family', CURRENT_TIMESTAMP)
      RETURNING id`)
    const { rows: sourceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      VALUES (${userId}, 'direct', ${lineageId}) RETURNING id`)
    await expect(
      write(sql`/* rejectFamilyObservationOnDirectState */
        INSERT INTO membership_source_states (
          membership_source_id, source_kind, membership_provider_lineage_id,
          membership_provider_observation_id, membership_product_id, effective_at
        ) VALUES (${sourceRows[0]!.id}, 'direct', ${lineageId},
          ${observationRows[0]!.id}, ${productId}, CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('keeps evidence identity immutable while allowing verified evidence invalidation', async () => {
    const suffix = randomUUID()
    const applicationId = `schema-evidence-immutability-${suffix}`
    const { rows: lineageRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`})
      RETURNING id`)
    const { rows: evidenceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, provider_event_id,
        evidence_lookup_sha256, encrypted_evidence
      ) VALUES ('stripe', 'test', ${applicationId}, ${`event-${suffix}`},
        ${suffix.replaceAll('-', '').padEnd(64, 'd')}, '\x01'::bytea)
      RETURNING id`)
    const evidenceId = evidenceRows[0]!.id

    await expect(
      write(sql`/* rejectReceivedEvidenceMutation */
        UPDATE membership_provider_evidence_records
        SET encrypted_evidence = '\x02'::bytea
        WHERE id = ${evidenceId}`),
    ).rejects.toThrow('membership provider evidence identity is immutable')
    await expect(
      write(sql`/* verifyReceivedEvidence */
        UPDATE membership_provider_evidence_records
        SET membership_provider_lineage_id = ${lineageRows[0]!.id},
            verified_at = CURRENT_TIMESTAMP
        WHERE id = ${evidenceId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`/* invalidateVerifiedEvidence */
        UPDATE membership_provider_evidence_records
        SET verified_at = NULL, rejected_at = CURRENT_TIMESTAMP,
            rejection_reason = 'provider invalidated evidence'
        WHERE id = ${evidenceId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`/* rejectInvalidatedEvidenceMutation */
        UPDATE membership_provider_evidence_records
        SET rejection_reason = 'changed verdict'
        WHERE id = ${evidenceId}`),
    ).rejects.toThrow('membership provider evidence lifecycle is terminal')
    await expect(
      write(sql`/* rejectEvidenceDeletion */
        DELETE FROM membership_provider_evidence_records WHERE id = ${evidenceId}`),
    ).rejects.toThrow('membership provider evidence records are immutable')

    const { rows: rejectedEvidenceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, provider_event_id,
        evidence_lookup_sha256, encrypted_evidence
      ) VALUES ('stripe', 'test', ${applicationId}, ${`rejected-event-${suffix}`},
        ${suffix.replaceAll('-', '').padEnd(64, 'e')}, '\x03'::bytea)
      RETURNING id`)
    await expect(
      write(sql`/* rejectReceivedEvidence */
        UPDATE membership_provider_evidence_records
        SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = 'invalid signature'
        WHERE id = ${rejectedEvidenceRows[0]!.id}`),
    ).resolves.toMatchObject({ rowCount: 1 })
  })
})
