import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUser } from '../run-support.mts'

const dueCount = 101
const unrelatedCount = 2_000
const totalCount = dueCount + unrelatedCount

export async function seedMembershipRefundDispatch() {
  const prefix = `explain-refund-dispatch-${randomUUID()}`
  await using query = await beginTransaction()
  const { rows } = await query<{
    id: string
    ordinal: number
  }>(sql`/* seedMembershipRefundDispatch */
    WITH context AS (
      SELECT fn_upsert_membership_provider_context_id('stripe', 'test', ${prefix}) AS id
    ), fixture AS (
      SELECT ordinal, uuidv7() AS id FROM generate_series(1, ${totalCount}::int) AS series(ordinal)
    ), lineages AS (
      INSERT INTO membership_provider_lineages (id, membership_provider_context_id, provider_lineage_id)
      SELECT fixture.id, context.id, ${prefix} || '-' || fixture.ordinal FROM fixture CROSS JOIN context
      RETURNING id, membership_provider_context_id
    ), bindings AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id, source_kind)
      SELECT id, ${seedUser.id}::uuid, 'direct' FROM lineages RETURNING id, membership_provider_lineage_id
    ), sources AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineages RETURNING id, membership_provider_lineage_id
    ), operations AS (
      INSERT INTO membership_operations (
        id, membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        membership_provider_context_id, operation_kind, idempotency_key, provider_payment_reference,
        provider_charge_id, qualifying_allocation_minor_units, remaining_refundable_minor_units,
        currency_code, requested_at, failed_at, failure_message, completed_at)
      SELECT fixture.id, sources.id, lineages.id, bindings.id, lineages.membership_provider_context_id,
        CASE WHEN fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 0
          THEN 'cancel_source' ELSE 'administrator_refund' END::membership_operation_kinds,
        ${prefix} || '-operation-' || fixture.ordinal,
        CASE WHEN fixture.ordinal <= ${dueCount} OR fixture.ordinal % 4 <> 0
          THEN 'ch_explain_' || fixture.id END,
        CASE WHEN fixture.ordinal <= ${dueCount} OR fixture.ordinal % 4 <> 0
          THEN 'ch_explain_' || fixture.id END,
        CASE WHEN fixture.ordinal <= ${dueCount} OR fixture.ordinal % 4 <> 0 THEN 700 END,
        CASE WHEN fixture.ordinal <= ${dueCount} OR fixture.ordinal % 4 <> 0 THEN 700 END,
        CASE WHEN fixture.ordinal <= ${dueCount} OR fixture.ordinal % 4 <> 0 THEN 'usd' END::currency_codes,
        CURRENT_TIMESTAMP - INTERVAL '2 days',
        CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0 THEN CURRENT_TIMESTAMP END,
        CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0 THEN 'Synthetic refund failure' END,
        CASE WHEN fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 3 THEN CURRENT_TIMESTAMP END
      FROM fixture JOIN lineages USING (id)
      JOIN bindings ON bindings.membership_provider_lineage_id = lineages.id
      JOIN sources ON sources.membership_provider_lineage_id = lineages.id
      RETURNING id
    )
    SELECT operations.id, fixture.ordinal FROM operations JOIN fixture USING (id) ORDER BY fixture.ordinal`)
  assert.equal(rows.length, totalCount)
  const ids = rows.map(row => row.id)
  const work = await query(sql`/* scheduleMembershipRefundDispatchFixture */
    UPDATE membership_operation_execution_work_items work
    SET available_at = CASE
      WHEN fixture.ordinal <= ${dueCount} THEN '1900-01-01'::timestamptz + fixture.ordinal * INTERVAL '1 second'
      WHEN fixture.ordinal % 4 = 2 THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
      ELSE '1899-01-01'::timestamptz END,
      lease_token = CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0
        OR fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 1 THEN uuidv7() END,
      leased_at = CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0
        THEN CURRENT_TIMESTAMP - INTERVAL '6 minutes'
        WHEN fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 1 THEN CURRENT_TIMESTAMP END,
      lease_expires_at = CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0
        THEN CURRENT_TIMESTAMP - INTERVAL '1 minute'
        WHEN fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 1 THEN 'infinity'::timestamptz END,
      attempt_count = CASE WHEN fixture.ordinal <= ${dueCount} AND fixture.ordinal % 2 = 0
        OR fixture.ordinal > ${dueCount} AND fixture.ordinal % 4 = 1 THEN 1 ELSE 0 END
    FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
    WHERE work.membership_operation_id = fixture.id`)
  assert.equal(work.rowCount, totalCount - unrelatedCount / 4)
  await query.commit()
  await write(
    '/* analyzeMembershipRefundDispatch */ ANALYZE membership_operations, membership_operation_execution_work_items',
  )
  return { ids, eligibleIds: ids.slice(0, dueCount), workRows: work.rowCount }
}

export async function readMembershipRefundDispatchState(query: TransactionQuery, ids: string[]) {
  const { rows } = await query<{
    id: string
    failed_at: string | null
    failure_message: string | null
    completed_at: string | null
    reconciliation_attempt_ordinal: number
    lease_token: string | null
    leased_at: string | null
    lease_expires_at: string | null
    lease_duration_seconds: number | null
    attempt_count: number | null
    available_at: string | null
  }>(sql`/* readMembershipRefundDispatchState */
    SELECT operation.id, operation.failed_at::text, operation.failure_message, operation.completed_at::text,
      operation.reconciliation_attempt_ordinal, work.lease_token, work.leased_at::text,
      work.lease_expires_at::text, CASE WHEN isfinite(work.lease_expires_at)
        THEN extract(epoch FROM work.lease_expires_at - work.leased_at)::integer END AS lease_duration_seconds,
      work.attempt_count, work.available_at::text
    FROM membership_operations operation
    LEFT JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
    WHERE operation.id = ANY(${ids}::uuid[]) ORDER BY operation.id`)
  return rows
}

export async function deferMembershipRefundDispatch(ids: string[]) {
  await write(sql`/* deferMembershipRefundDispatchFixture */
    UPDATE membership_operation_execution_work_items SET available_at = 'infinity'::timestamptz
    WHERE membership_operation_id = ANY(${ids}::uuid[])`)
}
