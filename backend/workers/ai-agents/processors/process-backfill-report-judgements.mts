import { getMinUuidv7ForDate } from '@modules/utils'
import { enqueueBulkReportJudgements } from '@queues/ai-agents/enqueues/report-judgement'
import {
  advanceJudgementBackfillCursor,
  judgementBackfillTargetKinds,
  readJudgementBackfillCursor,
  type JudgementBackfillCursor,
} from '@services/moderation-reports/judgement-backfill-cursor'
import { listMissingReportJudgementPage } from '@services/moderation-reports/judgement-backfill-page'
import { getModerationReportsWorkLimit } from '@services/moderation-reports/work-limits'

function nextCheckpoint(
  current: JudgementBackfillCursor,
  nextTargetId: string | null,
  upperBound: string,
): JudgementBackfillCursor {
  const nextKind =
    judgementBackfillTargetKinds[judgementBackfillTargetKinds.indexOf(current.target_kind) + 1]
  return {
    target_kind: nextTargetId ? current.target_kind : (nextKind ?? 'post'),
    cursor_target_id: nextTargetId,
    sweep_upper_bound_id: upperBound,
    is_sweep_complete: nextTargetId === null && nextKind === undefined,
  }
}

type BackfillRunResult = { enqueued: number; hasMore: boolean }

async function enqueueJudgementBackfillPage(
  cursor: JudgementBackfillCursor,
  before: string,
  batchSize: number,
  remainingTargets: number,
) {
  const page = await listMissingReportJudgementPage(
    cursor.target_kind,
    cursor.cursor_target_id,
    before,
    batchSize,
    remainingTargets,
  )
  if (page.entities.length > 0) await enqueueBulkReportJudgements(page.entities)
  return { nextTargetId: page.nextTargetId, enqueued: page.entities.length }
}

async function backfillRemainingBatches(
  cursor: JudgementBackfillCursor,
  before: string,
  batchSize: number,
  remainingBatches: number,
): Promise<BackfillRunResult> {
  const { enqueued, nextTargetId } = await enqueueJudgementBackfillPage(
    cursor,
    before,
    batchSize,
    batchSize * remainingBatches,
  )
  const next = nextCheckpoint(cursor, nextTargetId, before)
  if (!(await advanceJudgementBackfillCursor(cursor, next))) return { enqueued, hasMore: true }
  if (next.is_sweep_complete) return { enqueued, hasMore: false }
  if (remainingBatches === 1) return { enqueued, hasMore: true }

  const rest = await backfillRemainingBatches(next, before, batchSize, remainingBatches - 1)
  return { enqueued: enqueued + rest.enqueued, hasMore: rest.hasMore }
}

export async function processBackfillReportJudgements(): Promise<BackfillRunResult> {
  const cursor = await readJudgementBackfillCursor()
  const before = cursor.is_sweep_complete
    ? getMinUuidv7ForDate(new Date())
    : cursor.sweep_upper_bound_id!
  // A new pass must have a different bound so an old checkpoint cannot match after wraparound.
  if (
    cursor.is_sweep_complete &&
    cursor.sweep_upper_bound_id &&
    before <= cursor.sweep_upper_bound_id
  ) {
    return { enqueued: 0, hasMore: false }
  }
  return backfillRemainingBatches(
    cursor,
    before,
    getModerationReportsWorkLimit('backfill_batch_size'),
    getModerationReportsWorkLimit('backfill_max_batches_per_run'),
  )
}
