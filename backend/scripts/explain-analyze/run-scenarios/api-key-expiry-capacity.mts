import assert from 'node:assert/strict'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { getApiKeyExpiryLimits } from '@services/api-keys/work-limits'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import {
  claimApiKeyExpiryReminder,
  getApiKeyExpiryReminderDetails,
  getApiKeysDueForExpiryReminder,
} from '@services/api-keys/expiry-reminders'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  API_KEY_EXPIRY_FIXTURE_LABEL,
  seedApiKeyExpiryCapacity,
} from '../seed-data/api-key-expiry-capacity.mts'

const batchSize = 100
const duePoll = 'getApiKeysDueForExpiryReminder'
const detailsQuery = 'getApiKeyExpiryReminderDetails'
const claimQuery = 'claimApiKeyExpiryReminder'

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

async function capturePages({
  dueKeys,
  ids,
}: Awaited<ReturnType<typeof seedApiKeyExpiryCapacity>>) {
  const cursor: { after?: string } = {}
  const names = ['api-key-expiry-reminder-first-page', 'api-key-expiry-reminder-continuation']
  for (const [index, scenario] of names.entries()) {
    const expected = dueKeys.slice(index * batchSize, (index + 1) * batchSize)
    const last = expected.at(-1)!
    registerScenarioContract(scenario, {
      seededRows: { api_keys: ids.length },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        { kind: 'maxProcessedRows', relation: 'api_keys', max: batchSize },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
        { kind: 'usesIndexes', indexes: ['idx_api_keys__expiry_reminder'] },
      ],
      forbidSequentialScans: ['api_keys'],
    })
    await runAndCapture(
      scenario,
      async () => {
        if (index > 0)
          assert.ok(cursor.after, 'The first expiry reminder page must provide a cursor')
        const page = await getApiKeysDueForExpiryReminder(cursor.after, batchSize)
        assert.deepEqual(page, {
          ids: expected.map(key => key.id),
          nextCursor: encodeScopedPreciseTimestampCursor(
            last.expiresAt,
            last.id,
            'api-key-expiry-reminders',
          ),
        })
        cursor.after = page.nextCursor
      },
      undefined,
      duePoll,
      { exactCapturedNames: [duePoll], useWallClock: true },
    )
  }
}

async function capturePoints(fixture: Awaited<ReturnType<typeof seedApiKeyExpiryCapacity>>) {
  const { ids, firstDueIndex, firstSentIndex } = fixture
  const fixtureSize = ids.length
  const eligible = ids[firstDueIndex]!
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
        label: API_KEY_EXPIRY_FIXTURE_LABEL,
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
      assert.equal(before[firstDueIndex]?.expiry_reminder_sent_at, null)
      assert.ok(before[firstSentIndex]?.expiry_reminder_sent_at)
      assert.equal(await claimApiKeyExpiryReminder(eligible, { query }), true)
      assert.equal(await claimApiKeyExpiryReminder(sent, { query }), false)
      const { rows: after } = await inspectKeys(query, ids)
      const claimed = after[firstDueIndex]
      assert.ok(claimed?.expiry_reminder_sent_at)
      assert.equal(claimed.claimed_in_transaction, true)
      assert.deepEqual(
        after,
        before.with(firstDueIndex, {
          ...before[firstDueIndex]!,
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
  assert.equal(getApiKeyExpiryLimits().batchSize, batchSize)
  const fixture = await seedApiKeyExpiryCapacity(seedUser.id, batchSize)
  try {
    await write('/* analyzeExplainApiKeyExpiry */ ANALYZE api_keys')
    await capturePages(fixture)
    await capturePoints(fixture)
  } finally {
    await fixture.cleanup()
  }
}
