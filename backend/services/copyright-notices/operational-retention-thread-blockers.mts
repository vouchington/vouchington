import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { readCopyrightThreadScreeningPage } from './operational-retention-thread-blockers-screening.mts'
import { readCopyrightThreadStaffPage } from './operational-retention-thread-blockers-staff.mts'
import { readCopyrightThreadBusinessPage } from './operational-retention-thread-blockers-business.mts'

import type { BlockerCursor, BlockerPage } from './operational-retention-thread-blockers-state.mts'
export type {
  BlockerCursor,
  BlockerPage,
  BlockerPhase,
} from './operational-retention-thread-blockers-state.mts'

/** Each call reads one raw source page; a changed case generation discards every prior page. */
export async function checkCopyrightThreadBlockerPage(
  transaction: TransactionQuery,
  noticeId: string,
  now: Date,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerPage> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Invalid blocker page size')
  const { rows: generations } = await transaction<{ generation: string }>(sql`
    /* readCopyrightThreadBlockerGeneration */
    SELECT generation FROM copyright_notice_thread_blocker_generations
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE`)
  const generation = generations[0]?.generation ?? '0'
  const changed = generation !== cursor.generation
  const current: BlockerCursor = changed
    ? {
        phase: 'form_intake',
        childId: null,
        assessmentId: null,
        territorialDecisionId: null,
        generation,
      }
    : { ...cursor, phase: cursor.phase ?? 'form_intake', generation }
  const phase = current.phase!
  if (phase === 'done') return { ...current, blocked: false, done: true }

  const page =
    phase === 'form_intake' || phase.startsWith('form_')
      ? await readCopyrightThreadScreeningPage(transaction, noticeId, batchSize, current)
      : phase === 'territorial_receipts' ||
          phase === 'territorial_redress' ||
          phase === 'restrictions' ||
          phase === 'submissions' ||
          phase === 'legal_hold_assessments' ||
          phase === 'action_work_items' ||
          phase.startsWith('enforcement_')
        ? await readCopyrightThreadStaffPage(transaction, noticeId, batchSize, current)
        : await readCopyrightThreadBusinessPage(transaction, noticeId, now, batchSize, current)
  return { ...page, generation, done: page.phase === 'done' && !page.blocked }
}
