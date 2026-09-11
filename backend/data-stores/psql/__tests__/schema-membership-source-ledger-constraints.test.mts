import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('membership source-ledger schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects cross-source state, provider grant observations, and mismatched grant users', async () => {
    const suffix = randomUUID()
    const applicationId = `schema-negative-${suffix}`
    const firstUserId = randomUUID()
    const secondUserId = randomUUID()
    const { rows: productRows } = await read<{ id: string }>(
      `/* getMembershipLedgerNegativeTestProduct */
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
    )
    const productId = productRows[0]!.id
    const { rows: lineageRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestLineages */
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES
        ('stripe', 'test', ${applicationId}, ${`lineage-a-${suffix}`}),
        ('stripe', 'test', ${applicationId}, ${`lineage-b-${suffix}`})
      RETURNING id`)
    const [firstLineage, secondLineage] = lineageRows
    const { rows: sourceRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestSources */
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      VALUES
        (${firstUserId}, 'direct', ${firstLineage!.id}),
        (${secondUserId}, 'direct', ${secondLineage!.id})
      RETURNING id`)

    await expect(
      write(sql`/* rejectCrossSourceMembershipState */
        INSERT INTO membership_source_states (
          membership_source_id, source_kind, membership_provider_lineage_id,
          membership_product_id, effective_at
        ) VALUES (${sourceRows[0]!.id}, 'direct', ${secondLineage!.id}, ${productId}, CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23503' })

    const { rows: mappingRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestMapping */
      INSERT INTO membership_provider_products (
        membership_product_id, provider, environment, application_id,
        provider_product_id, price_minor_units, currency_code
      ) VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd')
      RETURNING id`)
    const evidenceHash = suffix.replaceAll('-', '').padEnd(64, '0')
    const { rows: evidenceRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestEvidence */
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at
      ) VALUES ('stripe', 'test', ${applicationId}, ${firstLineage!.id},
        ${evidenceHash}, '\x01'::bytea, CURRENT_TIMESTAMP)
      RETURNING id`)
    await expect(
      write(sql`/* rejectCrossLineageMembershipObservationEvidence */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          provider_revision, provider_order, source_kind, effective_at
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceRows[0]!.id},
          ${secondLineage!.id}, ${mappingRows[0]!.id}, ${productId}, 100, 'usd', 'cross-lineage', 1,
          'direct', CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      write(sql`/* rejectAdminGrantProviderObservation */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          provider_revision, provider_order, source_kind, effective_at
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceRows[0]!.id},
          ${firstLineage!.id}, ${mappingRows[0]!.id}, ${productId}, 100, 'usd', '1', 1,
          'admin_grant', CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23514' })

    const otherApplicationId = `schema-negative-other-${suffix}`
    const { rows: otherMappingRows } = await write<{ id: string }>(sql`
      /* createCrossContextRenewalTarget */
      INSERT INTO membership_provider_products (
        membership_product_id, provider, environment, application_id,
        provider_product_id, price_minor_units, currency_code
      ) VALUES (${productId}, 'stripe', 'test', ${otherApplicationId},
        ${`other-price-${suffix}`}, 200, 'usd')
      RETURNING id`)
    await expect(
      write(sql`/* rejectCrossContextRenewalTarget */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          renewal_membership_provider_product_id, renewal_membership_product_id,
          renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
          provider_revision, provider_order, source_kind, effective_at, auto_renews
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceRows[0]!.id},
          ${firstLineage!.id}, ${mappingRows[0]!.id}, ${productId}, 100, 'usd',
          ${otherMappingRows[0]!.id}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month',
          'cross-context-renewal', 2, 'direct', CURRENT_TIMESTAMP, true)`),
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      write(sql`/* rejectFamilyRenewalTarget */
        INSERT INTO membership_provider_observations (
          provider, environment, application_id, membership_provider_evidence_id,
          membership_provider_lineage_id, membership_provider_product_id,
          membership_product_id, observed_price_minor_units, observed_price_currency_code,
          renewal_membership_provider_product_id, renewal_membership_product_id,
          renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
          provider_revision, provider_order, source_kind, effective_at, auto_renews
        ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceRows[0]!.id},
          ${firstLineage!.id}, ${mappingRows[0]!.id}, ${productId}, 100, 'usd',
          ${mappingRows[0]!.id}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month',
          'family-renewal', 2, 'family', CURRENT_TIMESTAMP, true)`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: observationRows } = await write<{ id: string }>(sql`
      /* createImmutableMembershipObservation */
      INSERT INTO membership_provider_observations (
        provider, environment, application_id, membership_provider_evidence_id,
        membership_provider_lineage_id, membership_provider_product_id,
        membership_product_id, observed_price_minor_units, observed_price_currency_code,
        renewal_membership_provider_product_id, renewal_membership_product_id,
        renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at,
        provider_revision, provider_order, source_kind, effective_at, auto_renews
      ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceRows[0]!.id},
        ${firstLineage!.id}, ${mappingRows[0]!.id}, ${productId}, 100, 'usd',
        ${mappingRows[0]!.id}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month',
        'immutable', 3, 'direct', CURRENT_TIMESTAMP, true)
      RETURNING id`)
    await expect(
      write(sql`/* rejectMembershipObservationUpdate */
        UPDATE membership_provider_observations SET provider_order = 4
        WHERE id = ${observationRows[0]!.id}`),
    ).rejects.toThrow('membership provider observations are immutable')
    await expect(
      write(sql`/* rejectMembershipObservationDelete */
        DELETE FROM membership_provider_observations WHERE id = ${observationRows[0]!.id}`),
    ).rejects.toThrow('membership provider observations are immutable')

    const { rows: grantSourceRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestGrantSource */
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${firstUserId}, 'admin_grant') RETURNING id`)
    await expect(
      write(sql`/* rejectMismatchedMembershipGrantUser */
        INSERT INTO membership_grants (
          membership_source_id, user_id, membership_product_id,
          calendar_days, issuer_snapshot
        ) VALUES (${grantSourceRows[0]!.id}, ${secondUserId}, ${productId}, 30, 'schema test')`),
    ).rejects.toMatchObject({ code: '23503' })

    const { rows: grantRows } = await write<{ id: string }>(sql`
      /* createMembershipLedgerNegativeTestGrant */
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id,
        calendar_days, issuer_snapshot
      ) VALUES (${grantSourceRows[0]!.id}, ${firstUserId}, ${productId}, 30, 'schema test')
      RETURNING id`)
    await expect(
      write(sql`/* rejectMismatchedMembershipGrantActivationUser */
        INSERT INTO membership_grant_activation_periods (
          membership_grant_id, user_id, started_at
        ) VALUES (${grantRows[0]!.id}, ${secondUserId}, CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects observations derived from pending or rejected evidence', async () => {
    const suffix = randomUUID()
    const applicationId = `schema-evidence-${suffix}`
    const { rows: productRows } = await read<{ id: string }>(`
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
    const productId = productRows[0]!.id
    const { rows: lineageRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`}) RETURNING id`)
    const lineageId = lineageRows[0]!.id
    const { rows: mappingRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_products (
        membership_product_id, provider, environment, application_id,
        provider_product_id, price_minor_units, currency_code
      ) VALUES (${productId}, 'stripe', 'test', ${applicationId},
        ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
    const { rows: evidenceRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, rejected_at, rejection_reason
      ) VALUES
        ('stripe', 'test', ${applicationId}, ${lineageId},
          ${suffix.replaceAll('-', '').padEnd(64, 'a')}, '\x01'::bytea, NULL, NULL),
        ('stripe', 'test', ${applicationId}, ${lineageId},
          ${suffix.replaceAll('-', '').padEnd(64, 'b')}, '\x02'::bytea,
          CURRENT_TIMESTAMP, 'invalid signature')
      RETURNING id`)

    for (const [providerRevision, evidence] of evidenceRows.entries()) {
      await expect(
        write(sql`/* rejectUnverifiedMembershipObservation */
          INSERT INTO membership_provider_observations (
            provider, environment, application_id, membership_provider_evidence_id,
            membership_provider_lineage_id, membership_provider_product_id,
            membership_product_id, observed_price_minor_units, observed_price_currency_code,
            provider_revision, provider_order, source_kind, effective_at
          ) VALUES ('stripe', 'test', ${applicationId}, ${evidence.id}, ${lineageId},
            ${mappingRows[0]!.id}, ${productId}, 100, 'usd', ${String(providerRevision)},
            ${providerRevision}, 'direct', CURRENT_TIMESTAMP)`),
      ).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('preserves canonical product identity while allowing retirement updates', async () => {
    const { rows } = await write<{ id: string }>(sql`/* createRetiredProductForIdentityTest */
      INSERT INTO membership_products (plan, billing_interval, retired_at)
      VALUES ('plus', 'monthly', CURRENT_TIMESTAMP)
      RETURNING id`)
    const productId = rows[0]!.id

    await expect(
      write(sql`/* updateMembershipProductRetirement */
        UPDATE membership_products SET retired_at = CURRENT_TIMESTAMP + INTERVAL '1 day'
        WHERE id = ${productId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`/* rejectMembershipProductPlanMutation */
        UPDATE membership_products SET plan = 'pro' WHERE id = ${productId}`),
    ).rejects.toThrow('membership product identity is immutable')
    await expect(
      write(sql`/* rejectMembershipProductIntervalMutation */
        UPDATE membership_products SET billing_interval = 'yearly' WHERE id = ${productId}`),
    ).rejects.toThrow('membership product identity is immutable')
  })
})
