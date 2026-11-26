import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import {
  claimApiKeyExpiryReminder,
  getApiKeyExpiryReminderDetails,
  getApiKeysDueForExpiryReminder,
} from '@services/api-keys/expiry-reminders'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

const batchSize = 100
const dueCount = 2_001
const currentStatesPerGroup = 5
const fixtureSize = dueCount * (1 + currentStatesPerGroup)
const firstSentIndex = dueCount + 4
const duePoll = 'getApiKeysDueForExpiryReminder'
const detailsQuery = 'getApiKeyExpiryReminderDetails'
const claimQuery = 'claimApiKeyExpiryReminder'
const label = 'Explain expiry reminder'

async function seedKeys(ids: readonly string[], salt: string) {
  const { rowCount } = await write(sql`/* seedExplainApiKeyExpiry */
    INSERT INTO api_keys
      (id, user_id, prefix, key_hash, label, expires_at, revoked_at,
        replaced_by_api_key_id, expiry_reminder_sent_at)
    SELECT id,
      CASE WHEN state = 0 THEN ${seedUser.id}::uuid ELSE ${seedUuid(1, '01')}::uuid END,
      'explain-expiry', sha256((${salt} || id::text)::bytea), ${label},
      CASE state
        WHEN -1 THEN NOW() - INTERVAL '1 day'
        WHEN 1 THEN NOW() + INTERVAL '60 days'
        ELSE NOW() + INTERVAL '3 days'
      END,
      CASE WHEN state = 2 THEN NOW() - INTERVAL '1 day' END,
      CASE WHEN state = 3 THEN ${ids[dueCount + 1]}::uuid END,
      CASE WHEN state = 4 THEN NOW() - INTERVAL '1 day' END
    FROM (
      SELECT id, CASE WHEN ordinality <= ${dueCount}::int THEN -1
        ELSE (ordinality - 1 - ${dueCount}::int) % ${currentStatesPerGroup}::int
      END AS state
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS fixture(id, ordinality)
    ) AS keys
  `)
  assert.equal(rowCount, fixtureSize)
}

function inspectKeys(query: TransactionQuery, ids: readonly string[]) {
  return query<{
    id: string
    user_id: string
    label: string
    expires_at: Date
    revoked_at: Date | null
    replaced_by_api_key_id: string | null
    expiry_reminder_sent_at: Date | null
    claimed_in_transaction: boolean
  }>(sql`/* inspectExplainApiKeyExpiry */
    SELECT id, user_id, label, expires_at, revoked_at, replaced_by_api_key_id,
      expiry_reminder_sent_at, expiry_reminder_sent_at IS NOT DISTINCT FROM NOW() AS claimed_in_transaction
    FROM api_keys WHERE id = ANY(${ids}::uuid[]) ORDER BY id
  `)
}

async function capturePages(dueIds: readonly string[]) {
  const pages = [
    ['api-key-expiry-reminder-first-page', undefined, dueIds.slice(0, batchSize)],
    [
      'api-key-expiry-reminder-continuation',
      dueIds[batchSize - 1],
      dueIds.slice(batchSize, 2 * batchSize),
    ],
  ] as const
  for (const [scenario, cursor, expected] of pages) {
    registerScenarioContract(scenario, {
      seededRows: { api_keys: fixtureSize },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // Main walks an expired key prefix on the first page. Tighten after #6549.
        { kind: 'maxProcessedRows', relation: 'api_keys', max: cursor ? 500 : 2_497 },
      ],
      forbidSequentialScans: ['api_keys'],
    })
    await runAndCapture(
      scenario,
      async () =>
        assert.deepEqual(await getApiKeysDueForExpiryReminder(cursor, batchSize), expected),
      undefined,
      duePoll,
      { exactCapturedNames: [duePoll], useWallClock: true },
    )
  }
}

async function capturePoints(ids: readonly string[]) {
  const eligible = ids[dueCount]!
  const sent = ids[firstSentIndex]!
  const contract = {
    seededRows: { api_keys: fixtureSize },
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['api_keys_pkey'] },
      { kind: 'maxProcessedRows', relation: 'api_keys', max: 1 },
    ],
    forbidSequentialScans: ['api_keys'],
  } as const
  const details = 'api-key-expiry-reminder-details'
  const claim = 'api-key-expiry-reminder-claim'
  registerScenarioContract(details, contract)
  registerScenarioContract(claim, contract)
  await runAndCapture(
    details,
    async () => {
      await using query = await beginTransaction()
      const {
        rows: [row],
      } = await inspectKeys(query, [eligible])
      assert.ok(row)
      assert.deepEqual(await getApiKeyExpiryReminderDetails(eligible, { query }), {
        user_id: seedUser.id,
        label,
        expires_at: row.expires_at,
      })
      assert.equal(await getApiKeyExpiryReminderDetails(sent, { query }), null)
      await query.rollback()
    },
    undefined,
    detailsQuery,
    {
      exactCapturedNames: ['inspectExplainApiKeyExpiry', detailsQuery, detailsQuery],
      useWallClock: true,
    },
  )
  await runAndCapture(
    claim,
    async () => {
      await using query = await beginTransaction()
      const { rows: before } = await inspectKeys(query, ids)
      assert.equal(before.length, fixtureSize)
      assert.equal(before[dueCount]?.expiry_reminder_sent_at, null)
      assert.ok(before[firstSentIndex]?.expiry_reminder_sent_at)
      assert.equal(await claimApiKeyExpiryReminder(eligible, { query }), true)
      assert.equal(await claimApiKeyExpiryReminder(sent, { query }), false)
      const { rows: after } = await inspectKeys(query, ids)
      const claimed = after[dueCount]
      assert.ok(claimed?.expiry_reminder_sent_at)
      assert.equal(claimed.claimed_in_transaction, true)
      assert.deepEqual(
        after,
        before.with(dueCount, {
          ...before[dueCount]!,
          expiry_reminder_sent_at: claimed.expiry_reminder_sent_at,
          claimed_in_transaction: true,
        }),
      )
      await query.rollback()
    },
    undefined,
    claimQuery,
    {
      exactCapturedNames: [
        'inspectExplainApiKeyExpiry',
        claimQuery,
        claimQuery,
        'inspectExplainApiKeyExpiry',
      ],
      useWallClock: true,
    },
  )
}

export async function runApiKeyExpiryCapacityScenarios() {
  // Sort expired history before the due keys, then interleave the remaining excluded states.
  const timestamp = Date.UTC(2000, 0, 1) + randomInt(86_400_000)
  const ids = Array.from({ length: fixtureSize }, (_, index) =>
    seedUuidAtTimestamp(timestamp, index),
  )
  await seedKeys(ids, randomUUID())
  try {
    await write('/* analyzeExplainApiKeyExpiry */ ANALYZE api_keys')
    const dueIds = ids.slice(dueCount).filter((_, index) => index % currentStatesPerGroup === 0)
    await capturePages(dueIds)
    await capturePoints(ids)
  } finally {
    await using query = await beginTransaction()
    await query(
      sql`/* cleanupExplainApiKeyExpiry */ DELETE FROM api_keys WHERE id = ANY(${ids}::uuid[])`,
    )
    await query(sql`/* cleanupExplainApiKeyExpiryIdentities */
      DELETE FROM retained_api_key_identities WHERE id = ANY(${ids}::uuid[])`)
    await query.commit()
  }
}
