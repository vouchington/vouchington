import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type MembershipObservationConstraintFixture = {
  allowObservationWithoutKnownPrice(): ReturnType<typeof write>
  rejectBackwardsRenewalEffectiveTime(): ReturnType<typeof write>
  rejectFamilyObservationOnDirectState(): ReturnType<typeof write>
  rejectPartialRenewalSnapshot(): ReturnType<typeof write>
}

export async function createMembershipObservationConstraintFixture(): Promise<MembershipObservationConstraintFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-observation-${suffix}`
  const userId = randomUUID()
  const { rows: productRows } = await read<{
    id: string
  }>(`/* getMembershipObservationConstraintProduct */
    SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
  const productId = productRows[0]!.id
  const { rows: mappingRows } = await write<{
    id: string
  }>(sql`/* createMembershipObservationConstraintMapping */
    INSERT INTO membership_provider_products (membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code)
    VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
  const { rows: lineageRows } = await write<{
    id: string
  }>(sql`/* createMembershipObservationConstraintLineage */
    INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
    VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`}) RETURNING id`)
  const lineageId = lineageRows[0]!.id
  const { rows: evidenceRows } = await write<{
    id: string
  }>(sql`/* createMembershipObservationConstraintEvidence */
    INSERT INTO membership_provider_evidence_records (provider, environment, application_id, membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence, verified_at)
    VALUES ('stripe', 'test', ${applicationId}, ${lineageId}, ${suffix.replaceAll('-', '').padEnd(64, 'c')}, '\x01'::bytea, CURRENT_TIMESTAMP) RETURNING id`)
  const evidenceId = evidenceRows[0]!.id
  const mappingId = mappingRows[0]!.id
  const { rows: priceOptionalEvidenceRows } = await write<{
    id: string
  }>(sql`/* createPriceOptionalMembershipObservationEvidence */
    INSERT INTO membership_provider_evidence_records (provider, environment, application_id, membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence, verified_at)
    VALUES ('stripe', 'test', ${applicationId}, ${lineageId}, ${randomUUID().replaceAll('-', '').padEnd(64, 'f')}, '\x04'::bytea, CURRENT_TIMESTAMP) RETURNING id`)
  const { rows: observationRows } = await write<{
    id: string
  }>(sql`/* createFamilyMembershipObservation */
    INSERT INTO membership_provider_observations (
      provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
      observed_price_minor_units, observed_price_currency_code, provider_revision, provider_order, source_kind, effective_at
    ) VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId}, ${mappingId}, ${productId}, 100, 'usd', 'family', 3, 'family', CURRENT_TIMESTAMP) RETURNING id`)
  const { rows: sourceRows } = await write<{
    id: string
  }>(sql`/* createDirectMembershipObservationSource */
    INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
    VALUES (${userId}, 'direct', ${lineageId}) RETURNING id`)

  return {
    allowObservationWithoutKnownPrice() {
      return write(sql`/* allowObservationWithoutKnownPrice */
        INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, provider_revision, provider_order, source_kind, effective_at)
        VALUES ('stripe', 'test', ${applicationId}, ${priceOptionalEvidenceRows[0]!.id}, ${lineageId}, ${mappingId}, ${productId}, 'price-optional', 0, 'direct', CURRENT_TIMESTAMP)`)
    },
    rejectPartialRenewalSnapshot() {
      return write(sql`/* rejectPartialRenewalSnapshot */
        INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, renewal_membership_provider_product_id, provider_revision, provider_order, source_kind, effective_at, auto_renews)
        VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId}, ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, 'partial', 1, 'direct', CURRENT_TIMESTAMP, true)`)
    },
    rejectBackwardsRenewalEffectiveTime() {
      return write(sql`/* rejectBackwardsRenewalEffectiveTime */
        INSERT INTO membership_provider_observations (provider, environment, application_id, membership_provider_evidence_id, membership_provider_lineage_id, membership_provider_product_id, membership_product_id, observed_price_minor_units, observed_price_currency_code, renewal_membership_provider_product_id, renewal_membership_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at, provider_revision, provider_order, source_kind, effective_at, auto_renews)
        VALUES ('stripe', 'test', ${applicationId}, ${evidenceId}, ${lineageId}, ${mappingId}, ${productId}, 100, 'usd', ${mappingId}, ${productId}, 200, 'usd', CURRENT_TIMESTAMP, 'backwards', 2, 'direct', CURRENT_TIMESTAMP + INTERVAL '1 day', true)`)
    },
    rejectFamilyObservationOnDirectState() {
      return write(sql`/* rejectFamilyObservationOnDirectState */
        INSERT INTO membership_source_states (membership_source_id, source_kind, membership_provider_lineage_id, membership_provider_observation_id, membership_product_id, effective_at)
        VALUES (${sourceRows[0]!.id}, 'direct', ${lineageId}, ${observationRows[0]!.id}, ${productId}, CURRENT_TIMESTAMP)`)
    },
  }
}

export type MembershipEvidenceLifecycleFixture = {
  invalidateVerifiedEvidence(): ReturnType<typeof write>
  rejectDeletion(): ReturnType<typeof write>
  rejectMutation(): ReturnType<typeof write>
  rejectTerminalMutation(): ReturnType<typeof write>
  rejectReceivedEvidence(): ReturnType<typeof write>
  verify(): ReturnType<typeof write>
}

export async function createMembershipEvidenceLifecycleFixture(): Promise<MembershipEvidenceLifecycleFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-evidence-immutability-${suffix}`
  const { rows: lineageRows } = await write<{ id: string }>(sql`/* createEvidenceLifecycleLineage */
    INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
    VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`}) RETURNING id`)
  const { rows: evidenceRows } = await write<{
    id: string
  }>(sql`/* createReceivedEvidenceForLifecycle */
    INSERT INTO membership_provider_evidence_records (provider, environment, application_id, provider_event_id, evidence_lookup_sha256, encrypted_evidence)
    VALUES ('stripe', 'test', ${applicationId}, ${`event-${suffix}`}, ${suffix.replaceAll('-', '').padEnd(64, 'd')}, '\x01'::bytea) RETURNING id`)
  const evidenceId = evidenceRows[0]!.id
  return {
    rejectMutation() {
      return write(
        sql`/* rejectReceivedEvidenceMutation */ UPDATE membership_provider_evidence_records SET encrypted_evidence = '\x02'::bytea WHERE id = ${evidenceId}`,
      )
    },
    verify() {
      return write(
        sql`/* verifyReceivedEvidence */ UPDATE membership_provider_evidence_records SET membership_provider_lineage_id = ${lineageRows[0]!.id}, verified_at = CURRENT_TIMESTAMP WHERE id = ${evidenceId}`,
      )
    },
    invalidateVerifiedEvidence() {
      return write(
        sql`/* invalidateVerifiedEvidence */ UPDATE membership_provider_evidence_records SET verified_at = NULL, rejected_at = CURRENT_TIMESTAMP, rejection_reason = 'provider invalidated evidence' WHERE id = ${evidenceId}`,
      )
    },
    rejectTerminalMutation() {
      return write(
        sql`/* rejectInvalidatedEvidenceMutation */ UPDATE membership_provider_evidence_records SET rejection_reason = 'changed verdict' WHERE id = ${evidenceId}`,
      )
    },
    rejectDeletion() {
      return write(
        sql`/* rejectEvidenceDeletion */ DELETE FROM membership_provider_evidence_records WHERE id = ${evidenceId}`,
      )
    },
    async rejectReceivedEvidence() {
      const { rows } = await write<{ id: string }>(sql`/* createRejectedEvidence */
        INSERT INTO membership_provider_evidence_records (provider, environment, application_id, provider_event_id, evidence_lookup_sha256, encrypted_evidence)
        VALUES ('stripe', 'test', ${applicationId}, ${`rejected-event-${suffix}`}, ${suffix.replaceAll('-', '').padEnd(64, 'e')}, '\x03'::bytea) RETURNING id`)
      return write(
        sql`/* rejectReceivedEvidence */ UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = 'invalid signature' WHERE id = ${rows[0]!.id}`,
      )
    },
  }
}

export async function createRetiredMembershipProduct(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createRetiredProductForIdentityTest */
    INSERT INTO membership_products (plan, billing_interval, retired_at) VALUES ('plus', 'monthly', CURRENT_TIMESTAMP) RETURNING id`)
  return rows[0]!.id
}

export function updateMembershipProductRetirement(productId: string) {
  return write(
    sql`/* updateMembershipProductRetirement */ UPDATE membership_products SET retired_at = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE id = ${productId}`,
  )
}
export function mutateMembershipProductPlan(productId: string) {
  return write(
    sql`/* rejectMembershipProductPlanMutation */ UPDATE membership_products SET plan = 'pro' WHERE id = ${productId}`,
  )
}
export function mutateMembershipProductInterval(productId: string) {
  return write(
    sql`/* rejectMembershipProductIntervalMutation */ UPDATE membership_products SET billing_interval = 'yearly' WHERE id = ${productId}`,
  )
}
