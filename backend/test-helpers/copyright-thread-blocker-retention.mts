import { beginTransaction } from '@data-stores/psql'
import { checkCopyrightThreadBlockerPage } from '../services/copyright-notices/operational-retention-thread-blockers.mts'
import { readCopyrightThreadEnforcementPage } from '../services/copyright-notices/operational-retention-thread-blockers-enforcement.mts'
import type {
  BlockerCursor,
  BlockerPage,
} from '../services/copyright-notices/operational-retention-thread-blockers-state.mts'

export async function readTestCopyrightThreadBlockerPage(
  noticeId: string,
  now: Date,
  cursor: BlockerCursor,
): Promise<BlockerPage> {
  await using transaction = await beginTransaction()
  const page = await checkCopyrightThreadBlockerPage(transaction, noticeId, now, 1, cursor)
  await transaction.commit()
  return page
}

export async function readTestCopyrightThreadEnforcementPage(
  noticeId: string,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  await using transaction = await beginTransaction()
  const page = await readCopyrightThreadEnforcementPage(transaction, noticeId, 1, cursor)
  await transaction.commit()
  return page
}
