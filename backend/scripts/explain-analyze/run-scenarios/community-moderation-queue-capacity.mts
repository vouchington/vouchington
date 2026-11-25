import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchCommunityModerationQueue } from '@services/communities/publications/moderation-queue'
import { encodeCommunityModerationQueueCursor } from '@services/communities/publications/moderation-queue-cursor'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCommunityModerationQueue } from './community-moderation-queue-fixture.mts'

const limit = 100
const queryName = 'searchCommunityModerationQueue'

// Upper bounds observed across both hosted captures and forced plan modes on main.
const reportVisits = {
  // Tighten after bounding the merged source pages. https://github.com/vouchington/vouchington/issues/6390
  merged: { first: 56_588_482, continuation: 54_419_103 },
  // Tighten after replacing the broad report lookups. https://github.com/vouchington/vouchington/issues/6391
  report: { first: 4_708_014, continuation: 51_927_745 },
}

function queueCursor(row: { id: string; created_at: Date }): string {
  return encodeCommunityModerationQueueCursor({
    id: row.id,
    // The fixture timestamps originate in UUIDv7 IDs. The route encodes six fractional digits.
    cursor_created_at: row.created_at.toISOString().replace(/Z$/, '000Z'),
  })
}

export async function runCommunityModerationQueueCapacityScenarios(): Promise<void> {
  const fixture = await seedCommunityModerationQueue()
  try {
    await write(`/* analyzeCommunityModerationQueue */
      ANALYZE posts, community_post_reviews, moderation_reports`)
    for (const source of [undefined, 'report'] as const) {
      const mode = source ?? 'merged'
      const expected = source ? fixture.queue.filter(row => row.source === source) : fixture.queue
      for (const [index, page] of (['first', 'continuation'] as const).entries()) {
        const scenario = `community-moderation-queue-${mode}-${page}`
        registerScenarioContract(scenario, {
          expectations: [
            {
              kind: 'maxProcessedRows',
              relation: 'moderation_reports',
              max: reportVisits[mode][page],
            },
          ],
          seededRows: {
            posts: SEEDED_ROWS_BY_RELATION.posts! + fixture.seededRows.posts,
            moderation_reports:
              SEEDED_ROWS_BY_RELATION.moderation_reports! + fixture.seededRows.moderation_reports,
          },
          crossPartition: {
            posts: 'Moderation reports and reviews can target posts across creation months.',
          },
        })
        const expectedPage = expected.slice(index * limit, (index + 1) * limit)
        assert.equal(expectedPage.length, limit)
        const after = index === 0 ? undefined : queueCursor(expected[index * limit - 1]!)
        const expectedEnd = queueCursor(expectedPage.at(-1)!)
        await runAndCapture(
          scenario,
          async () => {
            const result = await searchCommunityModerationQueue(fixture.communityId, {
              limit,
              source,
              after,
            })
            assert.deepEqual(
              result.entries.map(row => ({ id: row.id, source: row.queue_source })),
              expectedPage.map(({ id, source: queueSource }) => ({ id, source: queueSource })),
            )
            assert.equal(result.hasNextPage, true)
            assert.equal(encodeCommunityModerationQueueCursor(result.entries.at(-1)!), expectedEnd)
          },
          undefined,
          queryName,
        )
      }
    }
  } finally {
    await fixture.cleanup()
  }
}
