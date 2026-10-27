import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  cleanupClassifierChildRetentionFixture,
  countClassifierRows,
  probeClassifierChildPagesForRetentionTest,
  readClassifierChildRetentionCounts,
  seedClassifierChildRowsForRetentionTest,
  seedClassifierRunPayloadsAt,
} from '@voucha/test-helpers/classifier-retention'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import { createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'

describe('classifier child retention on owned PostgreSQL rows', () => {
  it('pages terminal children across all three families while preserving pending rows and identities', async () => {
    const setup = await createSyntheticFixture()
    const topic = await createTestTopic()
    // Recent IDs avoid unrelated scheduled retention; this direct page test supplies its own cutoff.
    const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000 + randomInt(0, 24 * 60 * 60 * 1_000))
    const { terminalIds, pendingId, requestId } = await seedClassifierRunPayloadsAt({
      slug: setup.slug,
      postId: setup.post.id,
      actorId: setup.actorId,
      currentInputSha256: setup.post.inputSha256,
      at,
      terminalCount: 1,
      pendingFirst: true,
    })
    const terminalId = terminalIds[0]!
    try {
      await seedClassifierChildRowsForRetentionTest([terminalId, pendingId], topic.id)
      const lowerBoundId = getMinUUIDv7ForDate(new Date(at.getTime() - 1))
      const cutoffId = getMinUUIDv7ForDate(new Date(at.getTime() + 1_000))

      expect(await readClassifierChildRetentionCounts([terminalId, pendingId])).toEqual({
        run_candidates: 2,
        agent_topics: 2,
        local_outcomes: 2,
      })

      for (const sweep of ['run_candidates', 'agent_topics', 'local_outcomes'] as const) {
        // One transaction holds the cursor row through both production pages and rolls back.
        const probe = await probeClassifierChildPagesForRetentionTest(
          sweep,
          cutoffId,
          lowerBoundId,
          terminalId,
          pendingId,
        )
        expect(probe).toEqual({
          pages: [
            { scanned: 1, deleted: 0, hasMore: true },
            { scanned: 1, deleted: 1, hasMore: false },
          ],
          cursorAfterFirst: pendingId,
          cursorAfterSecond: null,
          terminalChildren: 0,
          pendingChildren: 1,
          runs: 2,
          identities: 2,
        })
      }

      // The probe rollback leaves both owned fixture rows and every shared cursor unchanged.
      expect(await readClassifierChildRetentionCounts([terminalId, pendingId])).toEqual({
        run_candidates: 2,
        agent_topics: 2,
        local_outcomes: 2,
      })
      expect(await countClassifierRows('classifier_runs', [terminalId, pendingId])).toBe(2)
      expect(await countClassifierRows('classifier_run_identities', [terminalId, pendingId])).toBe(
        2,
      )
    } finally {
      await cleanupClassifierChildRetentionFixture([terminalId, pendingId], requestId)
    }
  })
})
