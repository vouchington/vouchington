import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

export const API_KEY_EXPIRY_FIXTURE_LABEL = 'Explain expiry reminder'
const dueCount = 2_001
const currentStatesPerGroup = 5
const fixtureSize = dueCount * (1 + currentStatesPerGroup)

export async function seedApiKeyExpiryCapacity(seedUserId: string, batchSize: number) {
  // Sort expired history before the due keys, then interleave the remaining excluded states.
  // The earliest expiry group follows the first ID page, so the sample alone cannot answer it.
  const timestamp = Date.UTC(2000, 0, 1) + randomInt(86_400_000)
  const ids = Array.from({ length: fixtureSize }, (_, index) =>
    seedUuidAtTimestamp(timestamp, index),
  )
  const salt = randomUUID()
  const { rowCount } = await write(sql`/* seedExplainApiKeyExpiry */
    INSERT INTO api_keys
      (id, user_id, prefix, key_hash, label, expires_at, revoked_at,
        replaced_by_api_key_id, expiry_reminder_sent_at)
    SELECT id,
      CASE WHEN state = 0 THEN ${seedUserId}::uuid ELSE ${seedUuid(1, '01')}::uuid END,
      'explain-expiry', sha256((${salt} || id::text)::bytea), ${API_KEY_EXPIRY_FIXTURE_LABEL},
      CASE state
        WHEN -1 THEN NOW() - INTERVAL '1 day'
        WHEN 0 THEN NOW() + CASE
          WHEN ordinality <= ${dueCount + batchSize * currentStatesPerGroup} THEN INTERVAL '4 days'
          WHEN ordinality <= ${dueCount + 2 * batchSize * currentStatesPerGroup} THEN INTERVAL '3 days'
          ELSE INTERVAL '5 days'
        END
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
  `)
  assert.equal(rowCount, fixtureSize)
  return {
    ids,
    dueIds: ids.slice(dueCount).filter((_, index) => index % currentStatesPerGroup === 0),
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
