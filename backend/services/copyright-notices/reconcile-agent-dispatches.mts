import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbCursorScope } from '@vouchington/postgres/query-telemetry'
import { buildPendingCopyrightAgentDispatchesQuery } from './pending-agent-dispatches-query.mts'

export type CopyrightAgentDispatch =
  | { kind: 'email'; intakeId: string }
  | { kind: 'form-screening'; submissionId: string }
  | { kind: 'form-effect'; submissionId: string }
  | { kind: 'appeal'; submissionId: string }
  | { kind: 'submission-guidance'; submissionId: string }

export type CopyrightAgentDispatchPage = {
  results: CopyrightAgentDispatch[]
  page_info: PageInfo
}

type CopyrightAgentDispatchRow = {
  kind: CopyrightAgentDispatch['kind']
  id: string
}

/**
 * Durable source-of-truth sweep for post-commit enqueue failures and exhausted queue retries, paged
 * by the dispatched intake or submission ID. An ID keyset skips no work because every row sharing
 * an ID is the same dispatch: a form submission is either unscreened or screened, and appeals are
 * never form submissions. An email that staff already decided needs no recommendation, so an
 * email decided while intake was paused is not sent to the model after the switch turns on.
 */
export async function getPendingCopyrightAgentDispatches(
  options: { after?: string; limit?: number } = {},
): Promise<CopyrightAgentDispatchPage> {
  const limit = options.limit ?? 100
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= 100,
    422,
    'limit must be between 1 and 100',
  )
  const cursor = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid copyright agent dispatch cursor')
    : null
  observeSharedDbScope('getPendingCopyrightAgentDispatches', sharedDbCursorScope(cursor?.id))
  const query = buildPendingCopyrightAgentDispatchesQuery()
  if (cursor) query.append(sql`\n    WHERE id > ${cursor.id}`)
  query.append(sql`\n    ORDER BY id LIMIT ${limit + 1}`)
  const { rows } = await read<CopyrightAgentDispatchRow>(query)
  const page = rows.slice(0, limit)
  return {
    results: page.map(toCopyrightAgentDispatch),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}

function toCopyrightAgentDispatch(row: CopyrightAgentDispatchRow): CopyrightAgentDispatch {
  if (row.kind === 'email') return { kind: 'email', intakeId: row.id }
  return { kind: row.kind, submissionId: row.id }
}
