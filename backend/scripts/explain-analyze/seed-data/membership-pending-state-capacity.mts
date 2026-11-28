import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuidAtTimestamp } from './common.mts'

const pageSize = 50
const ownRows = 64
const backgroundUsers = 80
const recordsPerBackgroundUser = 20
const focusedGrants = 100
const corpusRows = ownRows + backgroundUsers * recordsPerBackgroundUser
const grantRows = focusedGrants + backgroundUsers * recordsPerBackgroundUser
const statuses = ['pending', 'verified', 'conflict', 'rejected'] as const
const reasons = [null, 'verified', 'competing_direct_source', 'invalid_evidence'] as const

function seedGrants(query: TransactionQuery, users: string[], grantIds: string[]) {
  return query(sql`/* seedMembershipPendingStateCapacity:grants */
    WITH fixture AS (
      SELECT id, ordinal,
        CASE WHEN ordinal <= ${focusedGrants} THEN (${users}::uuid[])[1]
          ELSE (${users}::uuid[])[2 + (ordinal - ${focusedGrants} - 1) / ${recordsPerBackgroundUser}::int]
        END AS user_id
      FROM unnest(${grantIds}::uuid[]) WITH ORDINALITY AS ids(id, ordinal)
    ), sources AS (
      INSERT INTO membership_sources (id, user_id, source_kind)
      SELECT id, user_id, 'admin_grant' FROM fixture
      RETURNING id, user_id
    ), grants AS (
      INSERT INTO membership_grants (id, membership_source_id, user_id, membership_product_id,
        calendar_days, issuer_snapshot, revoked_at, revoked_by_id, revocation_reason)
      SELECT fixture.id, sources.id, sources.user_id, product.id, 30, 'EXPLAIN queued grant',
        CASE WHEN ordinal = 3 THEN CURRENT_TIMESTAMP END,
        CASE WHEN ordinal = 3 THEN sources.user_id END,
        CASE WHEN ordinal = 3 THEN 'EXPLAIN revoked grant' END
      FROM fixture JOIN sources USING (id)
      JOIN membership_products product ON product.plan = 'plus'
        AND product.billing_interval = 'monthly' AND product.retired_at IS NULL
      RETURNING id, user_id
    )
    INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at, ended_at)
    SELECT grants.id, grants.user_id, CURRENT_TIMESTAMP -
      CASE WHEN fixture.ordinal = 1 THEN interval '1 day' ELSE interval '31 days' END,
      CASE WHEN fixture.ordinal = 2 THEN CURRENT_TIMESTAMP END
    FROM grants JOIN fixture USING (id)
    WHERE fixture.ordinal IN (1, 2)
  `)
}

function seedProviderRecords(
  query: TransactionQuery,
  users: string[],
  ids: string[],
  application: string,
) {
  return query(sql`/* seedMembershipPendingStateCapacity:providerRecords */
    WITH fixture AS (
      SELECT id, ordinal,
        CASE WHEN ordinal <= ${ownRows} THEN (${users}::uuid[])[1]
          ELSE (${users}::uuid[])[2 + (ordinal - ${ownRows} - 1) / ${recordsPerBackgroundUser}::int]
        END AS user_id
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS ids(id, ordinal)
    ), context AS (
      SELECT fn_upsert_membership_provider_context_id('stripe', 'test', ${application}) AS id
    ), lineages AS (
      INSERT INTO membership_provider_lineages (id, membership_provider_context_id, provider_lineage_id)
      SELECT fixture.id, context.id, 'explain-pending-' || fixture.id FROM fixture CROSS JOIN context
      RETURNING id, membership_provider_context_id
    ), bindings AS (
      INSERT INTO membership_lineage_bindings (id, membership_provider_lineage_id, user_id)
      SELECT lineages.id, lineages.id, fixture.user_id FROM lineages JOIN fixture USING (id)
      RETURNING id
    ), sources AS (
      INSERT INTO membership_sources (id, user_id, source_kind, membership_provider_lineage_id)
      SELECT lineages.id, fixture.user_id, 'direct', lineages.id FROM lineages JOIN fixture USING (id)
      RETURNING id
    ), evidence AS (
      INSERT INTO membership_provider_evidence_records (id, membership_provider_context_id,
        membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence)
      SELECT id, membership_provider_context_id, id, encode(sha256(uuid_send(id)), 'hex'),
        convert_to('synthetic explain evidence', 'UTF8')
      FROM lineages RETURNING id, membership_provider_context_id
    ), verifications AS (
      INSERT INTO membership_verifications (id, user_id, idempotency_key, request_fingerprint,
        membership_provider_evidence_record_id, membership_provider_context_id, verified_at,
        conflicted_at, rejected_at, result_code)
      SELECT fixture.id, fixture.user_id, fixture.id, encode(sha256(uuid_send(fixture.id)), 'hex'),
        evidence.id, evidence.membership_provider_context_id,
        CASE WHEN ordinal % 4 = 1 THEN CURRENT_TIMESTAMP END,
        CASE WHEN ordinal % 4 = 2 THEN CURRENT_TIMESTAMP END,
        CASE WHEN ordinal % 4 = 3 THEN CURRENT_TIMESTAMP END,
        (ARRAY[NULL, 'verified', 'competing_direct_source', 'invalid_evidence']::membership_verification_result_codes[])
          [1 + ordinal % 4]
      FROM fixture JOIN evidence USING (id)
    )
    INSERT INTO membership_operations (id, membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, membership_provider_context_id, operation_kind,
      idempotency_key, completed_at, failed_at, failure_message)
    SELECT id, id, id, id, lineages.membership_provider_context_id, 'cancel_source', 'explain-pending-' || id,
      CASE WHEN ordinal % 7 = 0 THEN CURRENT_TIMESTAMP END,
      CASE WHEN ordinal % 7 = 1 THEN CURRENT_TIMESTAMP END,
      CASE WHEN ordinal % 7 = 1 THEN 'Synthetic failure' END
    FROM fixture JOIN lineages USING (id) JOIN bindings USING (id) JOIN sources USING (id)
  `)
}

export async function seedMembershipPendingState() {
  const timestamp = Date.UTC(2000, 0, 1) + randomInt(2 ** 31)
  const users = Array.from({ length: backgroundUsers + 1 }, (_, index) =>
    seedUuidAtTimestamp(timestamp, index),
  )
  const grantIds = Array.from({ length: grantRows }, (_, index) =>
    seedUuidAtTimestamp(timestamp, users.length + index),
  )
  const records = Array.from({ length: corpusRows }, (_, index) =>
    seedUuidAtTimestamp(timestamp, users.length + grantIds.length + index),
  )
  await using query = await beginTransaction()
  const inserted = await query(sql`/* seedMembershipPendingStateCapacity:users */
    INSERT INTO users (id, username)
    SELECT id, 'explainpend' || ${timestamp.toString(36)} || ordinal::text
    FROM unnest(${users}::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)`)
  assert.equal(inserted.rowCount, users.length)
  assert.equal((await seedGrants(query, users, grantIds)).rowCount, 2)
  assert.equal((await seedProviderRecords(query, users, records, users[0]!)).rowCount, corpusRows)
  // Keep membership_operations large enough for a hash join when this domain runs without payment-ledger-retention.
  const { rows: opCounts } = await query<{ count: number }>(
    sql`/* seedMembershipPendingStateCapacity:operationCount */ SELECT count(*)::int AS count FROM membership_operations`,
  )
  if ((opCounts[0]?.count ?? 0) < 5_000) {
    await query(sql`/* seedMembershipPendingStateCapacity:operationNoise */
      WITH anchors AS (
        SELECT membership_source_id, membership_provider_lineage_id,
          membership_lineage_binding_id, membership_provider_context_id
        FROM membership_operations
        WHERE id = ANY(${records.slice(ownRows, ownRows + 3)}::uuid[])
      )
      INSERT INTO membership_operations (
        membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        membership_provider_context_id, operation_kind, idempotency_key, failed_at, failure_message)
      SELECT anchors.membership_source_id, anchors.membership_provider_lineage_id,
        anchors.membership_lineage_binding_id, anchors.membership_provider_context_id,
        'cancel_source',
        'explain-pending-noise-' || ${timestamp.toString(36)} || '-' || anchors.membership_source_id || '-' || n,
        CURRENT_TIMESTAMP, 'Synthetic explain noise'
      FROM anchors CROSS JOIN generate_series(1, 500) AS n`)
  }
  await query.commit()

  await write(`/* analyzeMembershipPendingStateCapacity */
    ANALYZE membership_grants, membership_grant_activation_periods, membership_verifications,
      membership_sources, membership_operations, membership_provider_contexts`)

  const own = records
    .slice(0, ownRows)
    .map((id, index) => ({ id, ordinal: index + 1 }))
    .toReversed()
  return {
    userId: users[0]!,
    expected: {
      grants: 97,
      verifications: own.slice(0, pageSize).map(({ id, ordinal }) => ({
        id,
        provider: 'stripe',
        status: statuses[ordinal % 4],
        reason_code: reasons[ordinal % 4],
      })),
      financial_operations: own
        .filter(({ ordinal }) => ordinal % 7 !== 0)
        .slice(0, pageSize)
        .map(({ id, ordinal }) => ({
          id,
          provider: 'stripe',
          kind: 'cancel_source',
          status: ordinal % 7 === 1 ? 'failed' : 'pending',
        })),
    },
    seededRows: {
      membership_grants: grantRows,
      membership_grant_activation_periods: 2,
      membership_verifications: corpusRows,
      membership_sources: grantRows + corpusRows,
      membership_operations: corpusRows,
      membership_provider_contexts: 1,
    },
  }
}
