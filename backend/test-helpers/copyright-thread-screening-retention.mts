import { beginTransaction } from '@data-stores/psql'
import { readCopyrightThreadScreeningPage } from '../services/copyright-notices/operational-retention-thread-blockers-screening.mts'
import type { BlockerCursor } from '../services/copyright-notices/operational-retention-thread-blockers.mts'

export function initialCopyrightThreadScreeningCursor(): BlockerCursor {
  return {
    phase: 'form_intake',
    childId: null,
    assessmentId: null,
    territorialDecisionId: null,
    generation: '0',
  }
}

export async function readTestCopyrightThreadScreeningPage(
  noticeId: string,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  await using transaction = await beginTransaction()
  const result = await readCopyrightThreadScreeningPage(transaction, noticeId, 1, cursor)
  await transaction.commit()
  return result
}
