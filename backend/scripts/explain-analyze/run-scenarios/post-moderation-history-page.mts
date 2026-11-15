import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { searchPostModerationsByPostIds } from '../../../services/moderation/search-post-moderations.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { seedPostModerationHistoryPage } from '../seed-data/post-moderation-history-page.mts'

/** Compare the per-post ordered index walk with the previous full-history ranking. */
export async function runPostModerationHistoryPageScenarios(): Promise<void> {
  const postIds = [seedUuid(2_500_000, 'da'), seedUuid(40, '05')]
  await seedPostModerationHistoryPage(postIds[0]!)
  let walkedIds: string[] = []
  registerScenarioContract('post-moderation-history-page', {
    forbidSequentialScans: ['agent_moderations'],
    expectations: [],
  })
  await runAndCapture(
    'post-moderation-history-page',
    async () => {
      const rows = await searchPostModerationsByPostIds(postIds)
      assert(rows.length > 0 && rows.length <= postIds.length * 10)
      assert(rows.every(row => postIds.includes(row.post_id)))
      walkedIds = rows.map(row => row.id)
    },
    undefined,
    'searchPostModerationsByPostIds',
    { exactCapturedNames: ['searchPostModerationsByPostIds'] },
  )
  registerScenarioContract('post-moderation-history-ranked-comparison', { expectations: [] })
  await runAndCapture(
    'post-moderation-history-ranked-comparison',
    async () => {
      const { rows } = await read<{ id: string; post_id: string }>(
        `/* postModerationHistoryRankedComparison */
        WITH ranked AS (
          SELECT id, post_id,
            row_number() OVER (PARTITION BY post_id ORDER BY id DESC) AS rn
          FROM agent_moderations
          WHERE post_id = ANY($1::uuid[]) AND deleted_at IS NULL
        )
        SELECT id, post_id FROM ranked WHERE rn <= 10 ORDER BY post_id, id DESC`,
        [postIds],
      )
      assert.deepEqual(
        rows.map(row => row.id),
        walkedIds,
      )
    },
    undefined,
    'postModerationHistoryRankedComparison',
    { exactCapturedNames: ['postModerationHistoryRankedComparison'] },
  )
}
