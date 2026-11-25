import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { searchTopHashtags } from '@services/topics/top-hashtags'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const scenario = 'top-hashtags-at-cap'
const queryName = 'searchTopHashtags'
const query = 'capacityhashtag'
const ids = Array.from({ length: 101 }, (_, index) => seedUuid(7_020_000 + index, 'e3'))
const background = Array.from({ length: 500 }, (_, index) => seedUuid(7_020_101 + index, 'e3'))
const aliasIds = [...ids, ...background]
// Three aliases tie through the latest-content keys across the page boundary. The remaining
// aliases draw from distinct recent posts so the materialized view has a realistic rank spread.
const lastRank = 98
const occurrences = aliasIds.flatMap((aliasId, index) => {
  const firstPost = index < ids.length ? 1000 + Math.min(index, lastRank) * 3 : 1400 + index * 3
  return Array.from({ length: 3 }, (_, offset) => ({
    alias_id: aliasId,
    post_id: seedUuid(firstPost + offset, '05'),
  }))
})

async function seedHashtags(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedTopHashtagCapacityAliases */ INSERT INTO topic_aliases (id, alias)
    SELECT id, CASE WHEN serial <= $2 THEN $3 ELSE 'backgroundhashtag' END || serial
    FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, serial)`,
    [aliasIds, ids.length, query],
  )
  await transaction(
    `/* seedTopHashtagCapacityOccurrences */ INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_user_id, source, authored_token)
    SELECT post.id, alias.id, post.created_by_id, 'explicit', alias.alias
    FROM jsonb_to_recordset($1::jsonb) AS fixture(post_id uuid, alias_id uuid)
    JOIN posts post ON post.id = fixture.post_id
    JOIN topic_aliases alias ON alias.id = fixture.alias_id`,
    [JSON.stringify(occurrences)],
  )
  await transaction(
    `/* seedTopHashtagCapacityRelations */ INSERT INTO relation__post__category__topic_alias
      (subject_id, object_id, created_by_id, votes_score_up)
    SELECT post_id, topic_alias_id, contributor_user_id, 1
    FROM post_topic_alias_sources WHERE topic_alias_id = ANY($1::uuid[])`,
    [aliasIds],
  )
  await transaction.commit()
}

async function refreshHashtags(): Promise<void> {
  await write('/* refreshTopHashtagCapacity */ REFRESH MATERIALIZED VIEW mv_top_hashtags')
  await write('/* analyzeTopHashtagCapacity */ ANALYZE mv_top_hashtags')
}

export async function runTopHashtagCapacityScenario(): Promise<void> {
  await seedHashtags()
  try {
    await refreshHashtags()
    const expectedIds = [...ids.slice(0, lastRank), ...ids.slice(lastRank).toReversed()]
    registerScenarioContract(scenario, {
      seededRows: { mv_top_hashtags: aliasIds.length + 1 },
      expectations: [],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await searchTopHashtags({ q: query, limit: 100 })
        assert.deepEqual(
          first.results.map(row => row.topic_alias_id),
          expectedIds.slice(0, 100),
        )
        assert.equal(first.hasNextPage, true)
        const after = first.results.at(-1)!
        assert.equal(after.item_count, 3)
        assert.equal(after.latest_content_id, seedUuid(1000 + lastRank * 3, '05'))
        const next = await searchTopHashtags({ q: query, limit: 100, after })
        assert.deepEqual(
          next.results.map(row => row.topic_alias_id),
          expectedIds.slice(100),
        )
        assert.equal(next.hasNextPage, false)
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName, queryName] },
    )
  } finally {
    await using transaction = await beginTransaction()
    await transaction(
      '/* deleteTopHashtagCapacitySources */ DELETE FROM post_topic_alias_sources WHERE topic_alias_id = ANY($1::uuid[])',
      [aliasIds],
    )
    await transaction(
      '/* deleteTopHashtagCapacityRelations */ DELETE FROM relation__post__category__topic_alias WHERE object_id = ANY($1::uuid[])',
      [aliasIds],
    )
    await transaction(
      '/* deleteTopHashtagCapacityAliases */ DELETE FROM topic_aliases WHERE id = ANY($1::uuid[])',
      [aliasIds],
    )
    await transaction.commit()
    await refreshHashtags()
  }
}
