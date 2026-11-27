import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export const API_KEY_EXPIRY_FIXTURE_LABEL = 'Explain expiry reminder'
const dueCount = 2_001
const currentStatesPerGroup = 5
const fixtureSize = dueCount * (1 + currentStatesPerGroup)
const dayMs = 86_400_000

export async function seedApiKeyExpiryCapacity(seedUserId: string, batchSize: number) {
  const longDueEnd = fixtureSize - (batchSize - 1) * currentStatesPerGroup
  const now = Date.now() - randomInt(3_600_000)
  const ids = Array.from({ length: fixtureSize }, (_, index) => {
    // Recently issued 30-day keys expire first, ahead of much older 365-day keys.
    const ageDays = index < dueCount ? 400 : index < longDueEnd ? 361 : 28
    return seedUuidAtTimestamp(now - ageDays * dayMs, index)
  })
  const salt = randomUUID()
  const { rows } = await write<{ id: string; expires_at: string }>(sql`/* seedExplainApiKeyExpiry */
    INSERT INTO api_keys
      (id, user_id, prefix, key_hash, label, expires_at, revoked_at,
        replaced_by_api_key_id, expiry_reminder_sent_at)
    SELECT id,
      CASE WHEN state = 0 THEN ${seedUserId}::uuid ELSE ${seedUuid(1, '01')}::uuid END,
      'explain-expiry', sha256((${salt} || id::text)::bytea), ${API_KEY_EXPIRY_FIXTURE_LABEL},
      CASE state
        WHEN -1 THEN NOW() - INTERVAL '1 day'
        WHEN 0 THEN NOW() + CASE WHEN ordinality > ${longDueEnd}::int
          THEN INTERVAL '2 days' ELSE INTERVAL '4 days' END
        WHEN 1 THEN NOW() + INTERVAL '60 days'
        ELSE NOW() + INTERVAL '3 days'
      END,
      CASE WHEN state = 2 THEN NOW() - INTERVAL '1 day' END,
      CASE WHEN state = 3 THEN ${ids[dueCount + 1]}::uuid END,
      CASE WHEN state = 4 THEN NOW() - INTERVAL '1 day' END
    FROM (
      SELECT id, ordinality, CASE WHEN ordinality <= ${dueCount}::int THEN -1
        ELSE (ordinality - 1 - ${dueCount}::int) % ${currentStatesPerGroup}::int
      END AS state
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS fixture(id, ordinality)
    ) AS keys
    RETURNING id, to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expires_at
  `)
  assert.equal(rows.length, fixtureSize)
  const expiryById = new Map(rows.map(row => [row.id, row.expires_at]))
  const byId = ids.slice(dueCount).filter((_, index) => index % currentStatesPerGroup === 0)
  const longDueCount = (longDueEnd - dueCount) / currentStatesPerGroup
  const dueKeys = [...byId.slice(longDueCount), ...byId.slice(0, longDueCount)].map(id => ({
    id,
    expiresAt: expiryById.get(id)!,
  }))
  assert.equal(dueKeys.length, dueCount)
  return {
    ids,
    dueKeys,
    firstDueIndex: dueCount,
    firstSentIndex: dueCount + 4,
    async cleanup() {
      await using query = await beginTransaction()
      await query(
        sql`/* cleanupExplainApiKeyExpiry */ DELETE FROM api_keys WHERE id = ANY(${ids}::uuid[])`,
      )
      await query(sql`/* cleanupExplainApiKeyExpiryIdentities */
        DELETE FROM retained_api_key_identities WHERE id = ANY(${ids}::uuid[])`)
      await query.commit()
    },
  }
}
