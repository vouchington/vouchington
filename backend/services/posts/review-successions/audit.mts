import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import {
  listReviewSuccessionHistoryAuditRows,
  REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE,
  type ReviewSuccessionHistoryAuditRow,
} from './audit-query.mts'

export { REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE } from './audit-query.mts'

export type ReviewSuccessionHistoryAuditClassification =
  | 'active_automatic'
  | 'terminal_manual'
  | 'ambiguous_missing_epoch'
  | 'incoherent'

export type ReviewSuccessionHistoryAuditFinding = {
  postId: string
  classification: ReviewSuccessionHistoryAuditClassification
  currentAuthorUserId: string | null
  currentTopicIds: string[]
  currentArchivedAt: Date | null
  newerExactCurrentSetReviews: Array<{
    id: string
    archivedAt: Date | null
    isPublic: boolean
    isOtherwisePublic: boolean
  }>
}

export type ReviewSuccessionHistoryAuditResult = {
  cutoffArchivedAt: string
  cursor: string | null
  hasMore: boolean
  findings: ReviewSuccessionHistoryAuditFinding[]
}

/** Reads one UUID-ordered page of pre-cutover archive history without any repair writes. */
export async function auditReviewSuccessionHistory(options: {
  cursor: string | null
  cutoffArchivedAt: string | null
}): Promise<ReviewSuccessionHistoryAuditResult> {
  assertAuditCursor(options.cursor)
  const cutoffArchivedAt = options.cutoffArchivedAt ?? (await readAuditCutoff())
  assertAuditCutoff(cutoffArchivedAt)
  const rows = await listReviewSuccessionHistoryAuditRows(options.cursor, cutoffArchivedAt)
  const page = pageReviewSuccessionHistoryAuditRows(rows)
  return {
    cutoffArchivedAt,
    cursor: page.cursor,
    hasMore: page.hasMore,
    findings: page.rows.map(toFinding),
  }
}

export function pageReviewSuccessionHistoryAuditRows(
  rows: readonly ReviewSuccessionHistoryAuditRow[],
): { rows: readonly ReviewSuccessionHistoryAuditRow[]; cursor: string | null; hasMore: boolean } {
  const pageRows = rows.slice(0, REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE)
  return {
    rows: pageRows,
    cursor: pageRows.at(-1)?.id ?? null,
    hasMore: rows.length > REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE,
  }
}

async function readAuditCutoff(): Promise<string> {
  const { rows } = await read<{ cutoff_archived_at: Date }>(
    '/* readReviewSuccessionHistoryAuditCutoff */ SELECT CURRENT_TIMESTAMP AS cutoff_archived_at',
  )
  const cutoff = rows[0]?.cutoff_archived_at
  if (!cutoff) throw new TypeError('Review succession history audit cutoff was not returned')
  return cutoff.toISOString()
}

function toFinding(row: ReviewSuccessionHistoryAuditRow): ReviewSuccessionHistoryAuditFinding {
  return {
    postId: row.id,
    classification: classifyRow(row),
    currentAuthorUserId: row.author_user_id,
    currentTopicIds: row.topic_ids ?? [],
    currentArchivedAt: row.archived_at,
    newerExactCurrentSetReviews: row.newer_exact_current_set_reviews.map(review => ({
      ...review,
      archivedAt: review.archivedAt === null ? null : new Date(review.archivedAt),
    })),
  }
}

function classifyRow(
  row: ReviewSuccessionHistoryAuditRow,
): ReviewSuccessionHistoryAuditClassification {
  if (
    row.active_predecessor_archived_at &&
    sameTimestamp(row.active_predecessor_archived_at, row.archived_at)
  )
    return 'active_automatic'
  if (row.matching_manual_override_at) return 'terminal_manual'
  if (
    row.active_predecessor_archived_at ||
    (row.matching_automatically_restored_at && row.archived_at !== null)
  )
    return 'incoherent'
  return 'ambiguous_missing_epoch'
}

function sameTimestamp(left: Date, right: Date | null): boolean {
  return right !== null && left.getTime() === right.getTime()
}

function assertAuditCursor(cursor: string | null): void {
  if (cursor !== null && !isUUID(cursor))
    throw new TypeError('Review succession history audit cursor must be a UUID')
}

function assertAuditCutoff(cutoffArchivedAt: string): void {
  if (Number.isNaN(Date.parse(cutoffArchivedAt)))
    throw new TypeError('Review succession history audit cutoff must be an ISO timestamp')
}
