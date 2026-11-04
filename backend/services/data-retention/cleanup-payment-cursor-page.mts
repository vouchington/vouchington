import { beginTransaction } from '@data-stores/psql'
import type { SQLStatement } from 'sql-template-strings'
import {
  lockPaymentCleanupCursor,
  savePaymentCleanupCursor,
} from './cleanup-payment-operations.mts'

type CursorTransaction = Awaited<ReturnType<typeof beginTransaction>>
type CursorPageKind = Parameters<typeof lockPaymentCleanupCursor>[1]

export type CursorPageRow = { id: string; due: boolean }

/**
 * Runs one bounded cleanup page over a persisted keyset cursor: reads pageSize + 1 ordered rows,
 * drains the first due row (children, then root) and steps the cursor past blocked rows. The
 * drained row is revisited until it is gone, so the cursor never moves onto or past it. A
 * completed pass resets the cursor; scoped runs pick exact ids and skip it.
 */
export async function runCursorCleanupPage(options: {
  kind: CursorPageKind
  pageSize: number
  recordIds?: readonly string[]
  permitDelete: SQLStatement
  selectPage: (query: CursorTransaction, cursorId: string | null) => Promise<CursorPageRow[]>
  lockDue: (query: CursorTransaction, dueId: string) => Promise<string | undefined>
  drainChildren: (query: CursorTransaction, rowId: string) => Promise<number>
  deleteRoot: (query: CursorTransaction, rowId: string) => Promise<number>
}) {
  const { kind, pageSize, recordIds } = options
  await using query = await beginTransaction()
  await query(options.permitDelete)
  const cursorId = recordIds ? null : await lockPaymentCleanupCursor(query, kind)
  const rows = await options.selectPage(query, cursorId)
  const page = rows.slice(0, pageSize)
  const dueIndex = page.findIndex(row => row.due)
  const dueId = dueIndex < 0 ? undefined : page[dueIndex]!.id
  const rowId = dueId ? await options.lockDue(query, dueId) : undefined
  let deleted = 0
  let rootDeleted = 0
  if (rowId) {
    deleted = await options.drainChildren(query, rowId)
    if (deleted < pageSize) {
      rootDeleted = await options.deleteRoot(query, rowId)
      deleted += rootDeleted
    }
  }
  const hasMore = rowId ? rootDeleted === 0 || rows.length > dueIndex + 1 : rows.length > pageSize
  if (!recordIds)
    await savePaymentCleanupCursor(
      query,
      kind,
      hasMore ? (page[(rowId ? dueIndex : page.length) - 1]?.id ?? cursorId) : null,
    )
  await query.commit()
  return { scanned: page.length, deleted, hasMore }
}
