import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type MembershipSourceLedgerConstraintFixture = {
  rejectAdminGrantProviderObservation(): ReturnType<typeof write>
  rejectCrossContextRenewalTarget(): ReturnType<typeof write>
  rejectCrossLineageObservationEvidence(): ReturnType<typeof write>
  rejectCrossSourceState(): ReturnType<typeof write>
  rejectFamilyRenewalTarget(): ReturnType<typeof write>
  rejectMismatchedGrantActivationUser(): ReturnType<typeof write>
  rejectMismatchedGrantUser(): ReturnType<typeof write>
  rejectObservationDeletion(): ReturnType<typeof write>
  rejectObservationUpdate(): ReturnType<typeof write>
}

export async function createMembershipSourceLedgerConstraintFixture(): Promise<MembershipSourceLedgerConstraintFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-negative-${suffix}`
  const firstUserId = randomUUID()
  const secondUserId = randomUUID()
  const { rows: productRows } = await read<{ id: string }>(
    `/* getMembershipLedgerNegativeTestProduct */ SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
  )
  const productId = productRows[0]!.id
  const { rows: lineages } = await write<{
    id: string
  }>(sql`/* createMembershipLedgerNegativeTestLineages */
    INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
    VALUES ('stripe', 'test', ${applicationId}, ${`lineage-a-${suffix}`}), ('stripe', 'test', ${applicationId}, ${`lineage-b-${suffix}`}) RETURNING id`)
  const [firstLineage, secondLineage] = lineages
  const { rows: sources } = await write<{
    id: string
  }>(sql`/* createMembershipLedgerNegativeTestSources */
    INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
    VALUES (${firstUserId}, 'direct', ${firstLineage!.id}), (${secondUserId}, 'direct', ${secondLineage!.id}) RETURNING id`)
  const { rows: mappings } = await write<{
    id: string
  }>(sql`/* createMembershipLedgerNegativeTestMapping */
    INSERT INTO membership_provider_products (membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code)
    VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
  const mappingId = mappings[0]!.id
  const { rows: evidenceRows } = await write<{
    id: string
  }>(sql`/* createMembershipLedgerNegativeTestEvidence */
    INSERT INTO membership_provider_evidence_records (provider, environment, application_id, membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence, verified_at)
    VALUES ('stripe', 'test', ${applicationId}, ${firstLineage!.id}, ${suffix.replaceAll('-', '').padEnd(64, '0')}, '\x01'::bytea, CURRENT_TIMESTAMP) RETURNING id`)
  const evidenceId = evidenceRows[0]!.id
  const { rows: otherMappings } = await write<{
    id: string
  }>(sql`/* createCrossContextRenewalTarget */
    INSERT INTO membership_provider_products (membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code)
    VALUES (${productId}, 'stripe', 'test', ${`schema-negative-other-${suffix}`}, ${`other-price-${suffix}`}, 200, 'usd') RETURNING id`)
  let immutableObservationId: string | undefined

  async function getImmutableObservationId(): Promise<string> {
    immutableObservationId ??= await createImmutableMembershipObservation(
      applicationId,
      evidenceId,
      firstLineage!.id,
      mappingId,
      productId,
    )
    return immutableObservationId
  }

  return {
    rejectCrossSourceState() {
      return write(
        sql`/* rejectCrossSourceMembershipState */ INSERT INTO membership_source_states (membership_source_id, source_kind, membership_provider_lineage_id, membership_product_id, effective_at) VALUES (${sources[0]!.id}, 'direct', ${secondLineage!.id}, ${productId}, CURRENT_TIMESTAMP)`,
      )
    },
    rejectCrossLineageObservationEvidence() {
      return write(sql`/* rejectCrossLineageMembershipObservationEvidence */
      INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, provider_revision, provider_order, source_kind, effective_at)
      VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${secondLineage!.id}, ${mappingId}, ${productId}, 100, 'usd', 'cross-lineage', 1, 'direct', CURRENT_TIMESTAMP)`)
    },
    rejectAdminGrantProviderObservation() {
      return write(sql`/* rejectAdminGrantProviderObservation */
      INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, provider_revision, provider_order, source_kind, effective_at)
      VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${firstLineage!.id}, ${mappingId}, ${productId}, 100, 'usd', '1', 1, 'admin_grant', CURRENT_TIMESTAMP)`)
    },
    rejectCrossContextRenewalTarget() {
      return write(sql`/* rejectCrossContextRenewalTarget */
      INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, renewal_membership_provider_product_id, renewal_membership_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at, provider_revision, provider_order, source_kind, effective_at, auto_renews)
      VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${firstLineage!.id}, ${mappingId}, ${productId}, 100, 'usd', ${otherMappings[0]!.id}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month', 'cross-context-renewal', 2, 'direct', CURRENT_TIMESTAMP, true)`)
    },
    rejectFamilyRenewalTarget() {
      return write(sql`/* rejectFamilyRenewalTarget */
      INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, renewal_membership_provider_product_id, renewal_membership_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at, provider_revision, provider_order, source_kind, effective_at, auto_renews)
      VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${firstLineage!.id}, ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month', 'family-renewal', 2, 'family', CURRENT_TIMESTAMP, true)`)
    },
    async rejectObservationUpdate() {
      return write(
        sql`/* rejectMembershipObservationUpdate */ UPDATE membership_provider_observations SET provider_order = 4 WHERE id = ${await getImmutableObservationId()}`,
      )
    },
    async rejectObservationDeletion() {
      return write(
        sql`/* rejectMembershipObservationDelete */ DELETE FROM membership_provider_observations WHERE id = ${await getImmutableObservationId()}`,
      )
    },
    async rejectMismatchedGrantUser() {
      const { rows: grantSources } = await write<{
        id: string
      }>(sql`/* createMembershipLedgerNegativeTestGrantSource */
        INSERT INTO membership_sources (user_id, source_kind) VALUES (${firstUserId}, 'admin_grant') RETURNING id`)
      return write(sql`/* rejectMismatchedMembershipGrantUser */
        INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
        VALUES (${grantSources[0]!.id}, ${secondUserId}, ${productId}, 30, 'schema test')`)
    },
    async rejectMismatchedGrantActivationUser() {
      const { rows: grantSources } = await write<{ id: string }>(
        sql`/* createMembershipLedgerNegativeTestGrantSource */ INSERT INTO membership_sources (user_id, source_kind) VALUES (${firstUserId}, 'admin_grant') RETURNING id`,
      )
      const { rows: grants } = await write<{ id: string }>(
        sql`/* createMembershipLedgerNegativeTestGrant */ INSERT INTO membership_grants (membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot) VALUES (${grantSources[0]!.id}, ${firstUserId}, ${productId}, 30, 'schema test') RETURNING id`,
      )
      return write(
        sql`/* rejectMismatchedMembershipGrantActivationUser */ INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at) VALUES (${grants[0]!.id}, ${secondUserId}, CURRENT_TIMESTAMP)`,
      )
    },
  }
}

export type UnverifiedMembershipObservationFixture = {
  rejectObservation(providerRevision: number): ReturnType<typeof write>
}

export async function createUnverifiedMembershipObservationFixture(): Promise<UnverifiedMembershipObservationFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-evidence-${suffix}`
  const { rows: products } = await read<{ id: string }>(
    `/* getUnverifiedMembershipObservationProduct */ SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
  )
  const productId = products[0]!.id
  const { rows: lineages } = await write<{ id: string }>(
    sql`/* createUnverifiedMembershipObservationLineage */ INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`}) RETURNING id`,
  )
  const lineageId = lineages[0]!.id
  const { rows: mappings } = await write<{ id: string }>(
    sql`/* createUnverifiedMembershipObservationMapping */ INSERT INTO membership_provider_products (membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code) VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd') RETURNING id`,
  )
  const { rows: evidence } = await write<{
    id: string
  }>(sql`/* createUnverifiedMembershipObservationEvidence */
    INSERT INTO membership_provider_evidence_records (provider, environment, application_id, membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence, rejected_at, rejection_reason)
    VALUES ('stripe', 'test', ${applicationId}, ${lineageId}, ${suffix.replaceAll('-', '').padEnd(64, 'a')}, '\x01'::bytea, NULL, NULL), ('stripe', 'test', ${applicationId}, ${lineageId}, ${suffix.replaceAll('-', '').padEnd(64, 'b')}, '\x02'::bytea, CURRENT_TIMESTAMP, 'invalid signature') RETURNING id`)
  return {
    rejectObservation(providerRevision) {
      return write(sql`/* rejectUnverifiedMembershipObservation */
    INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, provider_revision, provider_order, source_kind, effective_at)
    VALUES ('stripe', 'test', ${applicationId}, ${evidence[providerRevision]!.id}, ${lineageId}, ${mappings[0]!.id}, ${productId}, 100, 'usd', ${String(providerRevision)}, ${providerRevision}, 'direct', CURRENT_TIMESTAMP)`)
    },
  }
}

async function createImmutableMembershipObservation(
  applicationId: string,
  evidenceId: string,
  lineageId: string,
  mappingId: string,
  productId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createImmutableMembershipObservation */
    INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, renewal_membership_provider_product_id, renewal_membership_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at, provider_revision, provider_order, source_kind, effective_at, auto_renews)
    VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId}, ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP + INTERVAL '1 month', 'immutable', 3, 'direct', CURRENT_TIMESTAMP, true) RETURNING id`)
  return rows[0]!.id
}
