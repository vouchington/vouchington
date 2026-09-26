import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'

/** One UUID-keyset page of the immutable IDs a copyright reconcile sweep acts on. */
export type CopyrightSweepIdPage = {
  results: string[]
  page_info: PageInfo
}

export type CopyrightSweepPageOptions = { after?: string; limit?: number }

/** Validates a sweep page request. Callers fetch `limit + 1` rows after `afterId`. */
export function parseCopyrightSweepPageOptions(
  options: CopyrightSweepPageOptions,
  cursorMessage: string,
): { limit: number; afterId: string | null } {
  const limit = options.limit ?? 100
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= 100,
    422,
    'limit must be between 1 and 100',
  )
  const afterId = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, cursorMessage).id
    : null
  return { limit, afterId }
}

export type CopyrightSweepIdColumn =
  | 'enforcementAssessment'
  | 'formReviewIntake'
  | 'restorationDeadline'
  | 'rowId'

type SweepIdQuery = (statement: SQLStatement) => Promise<{ rows: Array<{ id: string }> }>

/** Runs one keyset page. Callers supply the SELECT/WHERE; the keyset tail stays here. */
export async function queryCopyrightSweepIdPage(
  options: CopyrightSweepPageOptions,
  cursorMessage: string,
  column: CopyrightSweepIdColumn,
  selectWhere: SQLStatement,
  query: SweepIdQuery,
): Promise<CopyrightSweepIdPage> {
  const parsed = parseCopyrightSweepPageOptions(options, cursorMessage)
  appendCopyrightSweepKeyset(selectWhere, column, parsed.afterId, parsed.limit)
  const { rows } = await query(selectWhere)
  return toCopyrightSweepIdPage(rows, parsed.limit)
}

function appendCopyrightSweepKeyset(
  query: SQLStatement,
  column: CopyrightSweepIdColumn,
  afterId: string | null,
  limit: number,
): void {
  if (column === 'enforcementAssessment') {
    if (afterId)
      query.append(sql`\n      AND copyright_notice_submission_assessment_id > ${afterId}`)
    query.append(sql`\n    ORDER BY copyright_notice_submission_assessment_id LIMIT ${limit + 1}`)
    return
  }
  if (column === 'formReviewIntake') {
    if (afterId) query.append(sql`\n      AND review.copyright_notice_form_intake_id > ${afterId}`)
    query.append(sql`\n    ORDER BY review.copyright_notice_form_intake_id LIMIT ${limit + 1}`)
    return
  }
  if (column === 'restorationDeadline') {
    if (afterId) query.append(sql`\n      AND deadline.id > ${afterId}`)
    query.append(sql`\n    ORDER BY deadline.id LIMIT ${limit + 1}`)
    return
  }
  if (afterId) query.append(sql`\n      AND id > ${afterId}`)
  query.append(sql`\n    ORDER BY id LIMIT ${limit + 1}`)
}

export function toCopyrightSweepIdPage(
  rows: ReadonlyArray<{ id: string }>,
  limit: number,
): CopyrightSweepIdPage {
  const page = rows.slice(0, limit)
  return {
    results: page.map(row => row.id),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}
