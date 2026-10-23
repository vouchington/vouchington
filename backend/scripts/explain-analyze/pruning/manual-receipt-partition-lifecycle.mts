import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { write, beginTransaction } from '@data-stores/psql'
import { retireExplicitRange } from '@data-stores/psql/migration-runner/retire-explicit-range'
import { retireReceiptRange } from '@data-stores/psql/migration-runner/retire-receipt-range'
import {
  assertExplicitRange,
  splitDefaultRange,
} from '@data-stores/psql/migration-runner/split-default-range'
import { readDefaultRangeCatalog } from '@data-stores/psql/migration-runner/split-default-range-catalog'
import { v7 } from 'uuid'

/** Runs only in the pruning proof's freshly migrated, independently owned database. */
export async function assertManualReceiptPartitionLifecycle() {
  const table = 'ai_agent_call_receipts'
  const fromId = v7({ msecs: Date.UTC(2100, 0, 1) })
  const toId = v7({ msecs: Date.UTC(2100, 0, 2) })
  const ids = [v7({ msecs: Date.UTC(2100, 0, 1, 6) }), v7({ msecs: Date.UTC(2100, 0, 1, 12) })]
  const operationKeys = ids.map(() => createHash('sha256').update(randomUUID()).digest('hex'))
  const requestHash = createHash('sha256').update(randomUUID()).digest('hex')
  const input = { table, fromId, toId, maxRows: 2 }

  assert.throws(
    () => assertExplicitRange({ ...input, fromId: toId }),
    /ordered lowercase UUIDv7 bounds/,
  )
  assert.throws(() => assertExplicitRange({ ...input, maxRows: 0 }), /maxRows must be an integer/)
  assert.throws(
    () => assertExplicitRange({ ...input, table: 'crawls' }),
    /not a registered DEFAULT-only RANGE table/,
  )
  await assert.rejects(
    retireExplicitRange({
      table: 'crawls',
      partitionName: 'crawls_missing',
      beforeDetach: async () => {},
    }),
    /not a registered DEFAULT-only RANGE table/,
  )
  await assert.rejects(
    retireExplicitRange({
      table,
      partitionName: 'ai_agent_call_receipts_missing',
      beforeDetach: async () => {},
    }),
    /not an explicit range/,
  )

  let defaultName: string
  {
    await using catalogQuery = await beginTransaction()
    const catalog = await readDefaultRangeCatalog(catalogQuery, table)
    defaultName = catalog.partitionName
  }
  await write(
    `/* seedManualReceiptPartitionKeys */ INSERT INTO ai_agent_call_receipt_keys
      (id, operation_key, request_sha256)
      SELECT id, operation_key, $3 FROM UNNEST($1::uuid[], $2::text[]) AS seed(id, operation_key)`,
    [ids, operationKeys, requestHash],
  )
  await write(
    `/* seedManualReceiptPartitions */ INSERT INTO ai_agent_call_receipts
      (id, agent_slug, status, result_ciphertext, completed_at)
      VALUES ($1, 'story-post', 'in_flight', NULL, NULL),
        ($2, 'story-post', 'done', 'ciphertext', now())`,
    ids,
  )

  await write(
    `/* installManualReceiptCrossSchemaReference */ CREATE SCHEMA proof_unreviewed_schema`,
  )
  await write(`/* installManualReceiptCrossSchemaReference */ CREATE TABLE
    proof_unreviewed_schema.receipt_reference
    (receipt_id uuid REFERENCES ai_agent_call_receipts(id) ON DELETE CASCADE)`)
  try {
    await assert.rejects(splitDefaultRange(input), /cross-schema referencing foreign key/)
  } finally {
    await write(`/* removeManualReceiptCrossSchemaReference */ DROP SCHEMA
      proof_unreviewed_schema CASCADE`)
  }

  await write(`/* installManualReceiptUnknownGuard */ CREATE TRIGGER proof_unreviewed_receipt_delete
    BEFORE DELETE ON ${defaultName} FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation()`)
  try {
    await assert.rejects(splitDefaultRange(input), /unreviewed DELETE trigger/)
  } finally {
    await write(`/* removeManualReceiptUnknownGuard */ DROP TRIGGER proof_unreviewed_receipt_delete
      ON ${defaultName}`)
  }
  await assert.rejects(splitDefaultRange({ ...input, maxRows: 1 }), /row move cap/)
  const { rows: before } = await write<{ count: number }>(
    `/* countManualReceiptsBeforeSplit */ SELECT count(*)::int AS count FROM ${defaultName}
      WHERE id >= $1 AND id < $2`,
    [fromId, toId],
  )
  assert.equal(before[0]?.count, 2)

  const { rows: fkBefore } = await write<{ definition: string }>(
    `/* captureManualReceiptFk */ SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conname = 'fk_moderation_report_judgements__agent_call_receipt'`,
  )
  assert.equal(fkBefore.length, 1)
  const split = await splitDefaultRange(input)
  assert.equal(split.moved, 2)
  const { rows: placed } = await write<{ id: string; leaf: string }>(
    `/* assertManualReceiptPlacement */ SELECT id, tableoid::regclass::text AS leaf
      FROM ai_agent_call_receipts WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids],
  )
  assert.equal(placed.length, 2)
  assert(placed.every(row => row.leaf === split.name))
  const { rows: fkAfter } = await write<{ definition: string }>(
    `/* assertManualReceiptFkRestored */ SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conname = 'fk_moderation_report_judgements__agent_call_receipt'`,
  )
  assert.deepEqual(fkAfter, fkBefore)

  await write(`/* installManualReceiptUnknownReference */ CREATE TABLE proof_receipt_reference
    (receipt_id uuid REFERENCES ai_agent_call_receipts(id) ON DELETE CASCADE)`)
  try {
    await assert.rejects(retireReceiptRange(split.name), /without a reviewed retirement action/)
  } finally {
    await write(`/* removeManualReceiptUnknownReference */ DROP TABLE proof_receipt_reference`)
  }
  await assert.rejects(retireReceiptRange(split.name), /in-flight paid call/)
  await write(
    `/* settleManualReceiptInFlight */ UPDATE ai_agent_call_receipts
      SET status = 'erased' WHERE id = $1`,
    [ids[0]],
  )
  assert.equal(await retireReceiptRange(split.name), 2)
  const { rows: retained } = await write<{ id: string }>(
    `/* assertManualReceiptKeysRetained */ SELECT id FROM ai_agent_call_receipt_keys
      WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  assert.equal(retained.length, 2)
  const { rows: receipts } = await write<{ id: string }>(
    `/* assertManualReceiptsRetired */ SELECT id FROM ai_agent_call_receipts
      WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  assert.equal(receipts.length, 0)
  await assert.rejects(
    write(
      `/* assertManualReceiptReplayBlocked */ INSERT INTO ai_agent_call_receipt_keys
        (id, operation_key, request_sha256) VALUES ($1, $2, $3)`,
      [v7({ msecs: Date.UTC(2100, 0, 3) }), operationKeys[0], requestHash],
    ),
    /duplicate key value/,
  )

  const fromCandidateId = v7({ msecs: Date.UTC(2101, 0, 1) })
  const toCandidateId = v7({ msecs: Date.UTC(2101, 0, 2) })
  const candidateRange = { fromId: fromCandidateId, toId: toCandidateId, maxRows: 1 }
  const { rows: guardBefore } = await write<{ tgenabled: string }>(
    `/* captureManualCandidateDeleteGuard */ SELECT tgenabled FROM pg_trigger
      WHERE tgname = 'trigger_classifier_decision_batch_candidates_owner_delete'
        AND tgrelid = 'classifier_decision_batch_candidates__default'::regclass`,
  )
  assert.equal(guardBefore.length, 1)
  const candidateSplit = await splitDefaultRange({
    table: 'classifier_decision_batch_candidates',
    ...candidateRange,
  })
  const reviewSplit = await splitDefaultRange({
    table: 'post_review_topic_ratings',
    ...candidateRange,
  })
  assert.equal(candidateSplit.moved, 0)
  assert.equal(reviewSplit.moved, 0)
  const { rows: guardAfter } = await write<{ tgenabled: string }>(
    `/* assertManualCandidateDeleteGuardRestored */ SELECT tgenabled FROM pg_trigger
      WHERE tgname = 'trigger_classifier_decision_batch_candidates_owner_delete'
        AND tgrelid = 'classifier_decision_batch_candidates__default'::regclass`,
  )
  assert.deepEqual(guardAfter, guardBefore)
  assert.equal(
    await retireExplicitRange({
      table: 'classifier_decision_batch_candidates',
      partitionName: candidateSplit.name,
      dependentPartitions: [
        { table: 'post_review_topic_ratings', partitionName: reviewSplit.name },
      ],
      beforeDetach: async () => {},
    }),
    0,
  )
  return {
    moved: split.moved,
    retired: 2,
    retainedKeys: retained.length,
    structuralGuardRestored: true,
  }
}
