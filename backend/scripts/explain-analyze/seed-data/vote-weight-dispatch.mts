import { beginTransaction, write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'
import { seedVoteWeightDirtyMarkers } from './vote-weight-dirty-markers.mts'

export const VOTE_WEIGHT_DISPATCH_SEED_COUNT = 2_400
export const VOTE_WEIGHT_DISPATCH_ANCHOR_MS = postSeedTimestampMs(0)
export const VOTE_WEIGHT_DISPATCH_WINDOW_START = new Date(VOTE_WEIGHT_DISPATCH_ANCHOR_MS - 60_000)
export const VOTE_WEIGHT_DISPATCH_WINDOW_END = new Date(VOTE_WEIGHT_DISPATCH_ANCHOR_MS + 60_000)
// Mixed 500-row family pages expose expensive post-scan source-kind filtering.
export async function seedVoteWeightDispatch(): Promise<void> {
  await seedAgeMilestoneUsers()
  await seedVoteWeightDirtyMarkers()
  await seedMembershipSignals()
  await write(
    '/* seedVoteWeightDispatch */ ANALYZE users, membership_provider_observations, membership_provider_lineages, membership_provider_evidence_records, membership_sources, membership_source_states, memberships',
  )
}
async function seedAgeMilestoneUsers(): Promise<void> {
  const rows: string[] = []
  const values: unknown[] = []
  for (let index = 0; index < 240; index++) {
    const id = seedUuidAtTimestamp(VOTE_WEIGHT_DISPATCH_ANCHOR_MS + index * 100, 100_000 + index)
    const removed = index % 6 === 0
    const overridden = index % 6 === 1
    values.push(
      id,
      removed ? VOTE_WEIGHT_DISPATCH_WINDOW_START : null,
      overridden ? VOTE_WEIGHT_DISPATCH_WINDOW_START : null,
    )
    const offset = values.length - 2
    rows.push(`($${offset}::uuid, $${offset + 1}::timestamptz, $${offset + 2}::timestamptz)`)
  }
  await write(
    `/* seedVoteWeightDispatch */ INSERT INTO users (id, deleted_at, vote_weight_admin_set_at)
     VALUES ${rows.join(', ')} ON CONFLICT (id) DO NOTHING`,
    values,
  )
}

async function seedMembershipSignals(): Promise<void> {
  const context = await write<{ id: string }>(
    `/* seedVoteWeightDispatch */ SELECT fn_upsert_membership_provider_context_id('stripe', 'production', 'voucha-web') AS id`,
  )
  const contextId = context.rows[0]!.id
  const product = await write<{ id: string; provider_product_id: string }>(
    `/* seedVoteWeightDispatch */ SELECT product.id, provider_product.id AS provider_product_id
     FROM membership_products product
     JOIN membership_provider_products provider_product ON provider_product.membership_product_id = product.id
     WHERE product.plan = 'plus' AND product.billing_interval = 'monthly'
       AND product.retired_at IS NULL AND provider_product.membership_provider_context_id = $1::uuid
     LIMIT 1`,
    [contextId],
  )
  const productId = product.rows[0]!.id
  const providerProductId = product.rows[0]!.provider_product_id
  for (let start = 0; start < VOTE_WEIGHT_DISPATCH_SEED_COUNT; start += 200) {
    const rows: string[] = []
    const values: unknown[] = []
    for (
      let index = start;
      index < Math.min(start + 200, VOTE_WEIGHT_DISPATCH_SEED_COUNT);
      index++
    ) {
      const sourceKind = index % 2 === 0 ? 'family' : 'direct'
      const eventAt = new Date(
        VOTE_WEIGHT_DISPATCH_ANCHOR_MS + (index - VOTE_WEIGHT_DISPATCH_SEED_COUNT / 2) * 80,
      )
      const effectiveAt = new Date(eventAt.getTime() - 1_000)
      values.push(
        seedUuid(index, 'a1'),
        seedUuid(index, 'a2'),
        seedUuid(index, 'a3'),
        seedUuid(index, 'a4'),
        seedUuid(index, 'a5'),
        seedUuid(1_000 + index, '01'),
        sourceKind,
        effectiveAt,
        eventAt,
      )
      const offset = values.length - 8
      rows.push(
        `($${offset}::uuid, $${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}::uuid, $${offset + 5}::uuid, $${offset + 6}::membership_source_kinds, $${offset + 7}::timestamptz, $${offset + 8}::timestamptz)`,
      )
    }
    await using transaction = await beginTransaction()
    const requested = `WITH requested (lineage_id, source_id, membership_id, evidence_id, observation_id, user_id, source_kind, effective_at, event_at) AS (VALUES ${rows.join(', ')})`
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO membership_provider_lineages (id, membership_provider_context_id, provider_lineage_id)
       SELECT lineage_id, $${values.length + 1}::uuid, 'explain-vote-weight-' || lineage_id::text FROM requested
       ON CONFLICT (id) DO NOTHING`,
      [...values, contextId],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO membership_sources (id, user_id, source_kind, membership_provider_lineage_id)
       SELECT source_id, user_id, source_kind, lineage_id FROM requested
       ON CONFLICT (id) DO NOTHING`,
      values,
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO membership_provider_evidence_records
         (id, membership_provider_context_id, provider, membership_provider_lineage_id, evidence_lookup_sha256, encrypted_evidence, verified_at)
       SELECT evidence_id, $${values.length + 1}::uuid, 'stripe', lineage_id,
         encode(sha256(evidence_id::text::bytea), 'hex'), '\\x01'::bytea, effective_at
       FROM requested ON CONFLICT (id) DO NOTHING`,
      [...values, contextId],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO membership_provider_observations
         (id, membership_provider_context_id, membership_provider_evidence_record_id,
          membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
          provider_revision, provider_order, source_kind, effective_at, expires_at)
       SELECT observation_id, $${values.length + 1}::uuid, evidence_id, lineage_id,
         $${values.length + 2}::uuid, $${values.length + 3}::uuid,
         'explain-vote-weight', 1, source_kind, effective_at, event_at
       FROM requested ON CONFLICT (id) DO NOTHING`,
      [...values, contextId, providerProductId, productId],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO membership_source_states
         (membership_source_id, source_kind, membership_provider_lineage_id,
          membership_provider_observation_id, membership_product_id, effective_at, expires_at)
       SELECT source_id, source_kind, lineage_id, observation_id,
         $${values.length + 1}::uuid, effective_at, event_at
       FROM requested ON CONFLICT (membership_source_id) DO NOTHING`,
      [...values, productId],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       INSERT INTO memberships
         (id, user_id, membership_source_id, source_kind, membership_product_id, effective_at, expires_at)
       SELECT membership_id, user_id, source_id, source_kind, $${values.length + 1}::uuid, effective_at, event_at
       FROM requested ON CONFLICT (id) DO NOTHING`,
      [...values, productId],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed fixture batches retain FK-dependent writes in one transaction
    await transaction(
      `/* seedVoteWeightDispatch */ ${requested}
       UPDATE membership_provider_evidence_records evidence
       SET verified_at = NULL, rejected_at = requested.event_at
       FROM requested WHERE evidence.id = requested.evidence_id`,
      values,
    )
    await transaction.commit()
  }
  // Rejected-evidence continuations resume within one observation's shared recipients.
  const sharedRows: string[] = []
  const sharedValues: unknown[] = []
  for (let index = 0; index < 6; index++) {
    sharedValues.push(seedUuid(index, 'a6'), seedUuid(index, 'a7'), seedUuid(5_000 + index, '01'))
    const offset = sharedValues.length - 2
    sharedRows.push(`($${offset}::uuid, $${offset + 1}::uuid, $${offset + 2}::uuid)`)
  }
  const requested = `WITH requested (source_id, membership_id, user_id) AS (VALUES ${sharedRows.join(', ')})`
  // Index 450 is the first (family) evidence event in the measured window.
  const sharedObservationIndex = 450
  const lineageId = seedUuid(sharedObservationIndex, 'a1')
  const observationId = seedUuid(sharedObservationIndex, 'a5')
  const effectiveAt = new Date(VOTE_WEIGHT_DISPATCH_ANCHOR_MS - 61_000)
  const expiresAt = VOTE_WEIGHT_DISPATCH_WINDOW_START
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedVoteWeightDispatch */ ${requested}
     INSERT INTO membership_sources (id, user_id, source_kind, membership_provider_lineage_id)
     SELECT source_id, user_id, 'family', $${sharedValues.length + 1}::uuid FROM requested
     ON CONFLICT (id) DO NOTHING`,
    [...sharedValues, lineageId],
  )
  await transaction(
    `/* seedVoteWeightDispatch */ ${requested}
     INSERT INTO membership_source_states
       (membership_source_id, source_kind, membership_provider_lineage_id,
        membership_provider_observation_id, membership_product_id, effective_at, expires_at)
     SELECT source_id, 'family', $${sharedValues.length + 1}::uuid,
       $${sharedValues.length + 2}::uuid, $${sharedValues.length + 3}::uuid,
       $${sharedValues.length + 4}::timestamptz, $${sharedValues.length + 5}::timestamptz
     FROM requested ON CONFLICT (membership_source_id) DO NOTHING`,
    [...sharedValues, lineageId, observationId, productId, effectiveAt, expiresAt],
  )
  await transaction(
    `/* seedVoteWeightDispatch */ ${requested}
     INSERT INTO memberships
       (id, user_id, membership_source_id, source_kind, membership_product_id, effective_at, expires_at)
     SELECT membership_id, user_id, source_id, 'family', $${sharedValues.length + 1}::uuid,
       $${sharedValues.length + 2}::timestamptz, $${sharedValues.length + 3}::timestamptz
     FROM requested ON CONFLICT (id) DO NOTHING`,
    [...sharedValues, productId, effectiveAt, expiresAt],
  )
  await transaction.commit()
}
