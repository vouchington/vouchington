import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { getCapturedQueries, extractQueryName } from '@voucha/test-helpers/explain-analyze'
import { getRssFeedItemElectionsByIdBatch } from '@services/elections-votes/rss-feed-item/get-election-batch'
import sql from 'sql-template-strings'
import { paginationMaxima } from '@services/pagination/config'
import { runAndCapture } from '../run-support.mts'

type SeedElection = {
  guid: string
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export async function runRssItemElectionsBatchScenario(): Promise<void> {
  // A full RSS page can hydrate 100 primary items and three previews per item.
  const limit = paginationMaxima.max_limit * 4
  const guids = Array.from({ length: limit }, (_, index) => `seed-item-guid-${limit - 1 - index}`)
  const { rows } = await read<SeedElection>(sql`/* rssItemElectionBatchFixture */
    SELECT guids.guid, item.id, item.votes_score_net, item.votes_count_up, item.votes_count_down
    FROM rss_feed_item_guids guids
    JOIN rss_feed_items item ON item.id = guids.id
    WHERE guids.guid = ANY(${guids}::text[]) AND item.deleted_at IS NULL
  `)
  const byGuid = new Map(rows.map(row => [row.guid, row]))
  assert.equal(byGuid.size, limit)
  const expected = guids.map(guid => {
    const row = byGuid.get(guid)
    assert.ok(row, `Missing seeded RSS item ${guid}`)
    return {
      __entity_type: 'rss_feed_item_election',
      id: row.id,
      votes_score_net: row.votes_score_net,
      votes_count_up: row.votes_count_up,
      votes_count_down: row.votes_count_down,
    }
  })
  const ids = expected.map(row => row.id)
  assert.equal(new Set(ids).size, limit)

  await runAndCapture(
    'rss-item-elections-batch-at-cap',
    async () => {
      const elections = await getRssFeedItemElectionsByIdBatch(ids)
      assert.deepEqual(elections, expected)
      const captured = getCapturedQueries().filter(
        query => extractQueryName(query.text) === 'getElectionsByIdBatch',
      )
      assert.equal(captured.length, 1)
      assert.deepEqual(captured[0]!.values[0], ids)
    },
    undefined,
    'getElectionsByIdBatch',
    { exactCapturedNames: ['getElectionsByIdBatch'] },
  )
}
