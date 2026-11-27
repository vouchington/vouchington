import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { listMissingReportJudgementPage } from '@services/moderation-reports/judgement-backfill-page'
import { getModerationReportsWorkLimit } from '@services/moderation-reports/work-limits'
import { seedJudgementBackfillPosts } from '@voucha/test-helpers/report-judgement-backfill-fixture'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

const SCENARIO = 'moderation-judgement-backfill-continuation-at-cap'
const QUERY = 'listMissingReportJudgementPage'
const FIXTURE_TIME = Date.UTC(2024, 3, 26)

export async function runModerationJudgementBackfillContinuationScenario(): Promise<void> {
  const capacity = getModerationReportsWorkLimit('backfill_batch_size')
  const ids = Array.from({ length: 2 * capacity + 1 }, (_, i) =>
    seedUuidAtTimestamp(FIXTURE_TIME, 41_000_000 + i),
  )
  try {
    const reportIds = await seedJudgementBackfillPosts(ids, seedUuid(1, '01'))
    await write(
      '/* analyzeJudgementBackfillContinuation */ ANALYZE moderation_report_clusters, moderation_reports, moderation_report_judgements, posts',
    )
    registerScenarioContract(SCENARIO, {
      crossPartition: {
        posts: 'Each bounded report candidate can reference a post from any month.',
      },
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_moderation_report_clusters__post_id'], noSort: true },
        {
          kind: 'maxProcessedRows',
          relation: 'moderation_report_clusters',
          max: 4 * (capacity + 1),
        },
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: capacity + 1 },
        { kind: 'maxProcessedRows', relation: 'posts', max: capacity + 1 },
        { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: capacity + 1 },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        const after = ids[capacity - 1]!
        const before = seedUuidAtTimestamp(FIXTURE_TIME, 41_000_000 + ids.length)
        const remaining =
          capacity * (getModerationReportsWorkLimit('backfill_max_batches_per_run') - 1)
        const page = await listMissingReportJudgementPage(
          'post',
          after,
          before,
          capacity,
          remaining,
        )
        assert.deepEqual(page, {
          entities: ids.slice(capacity, -1).map((entityId, i) => ({
            entityType: 'post',
            entityId,
            triggeringReportId: reportIds[capacity + i],
          })),
          nextTargetId: ids.at(-2),
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY] },
    )
  } finally {
    await write(
      '/* cleanupJudgementBackfillContinuation */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [ids],
    )
  }
}
