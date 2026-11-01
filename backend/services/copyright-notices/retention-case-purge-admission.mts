import { read } from '@data-stores/psql'
import { psql } from '@queues/psql/queues'
import { enqueueCopyrightCasePurgeBatch } from '@queues/psql/enqueues/copyright-case-purge'
import { enqueueCopyrightAccountClockSyncBatch } from '@queues/psql/enqueues/copyright-account-clock-sync'
import sql from 'sql-template-strings'
import { COPYRIGHT_CASE_RETENTION_MONTHS } from './retention-case-purge-eligibility.mts'
import { isCopyrightEvidenceRetentionDeletionEnabled } from './config.mts'
import { getCopyrightCasePurgePageSize } from '@queues/psql/enqueues/ordering-config'
import type { CopyrightCasePurgeAdmissionData } from '../../queues/background/enqueues/notifications-domain.mts'

const MAX_PSQL_PENDING = 1_000

type CopyrightCasePurgeAdmissionCursor = NonNullable<CopyrightCasePurgeAdmissionData['after']>

/** Owners whose case row is gone and whose party cleanup is pending, found by the partial index. */
export function copyrightResidualRecoveryStatement(afterId: string | undefined, pageSize: number) {
  // Only owners carrying the marker are read, so a run is bounded by unfinished purges and never
  // by the number of cases ever created.
  const cursor = afterId ? sql` AND id > ${afterId}::uuid` : sql``
  return sql`/* admitCopyrightResidualCaseRecoveryPage */
    SELECT id FROM retained_copyright_notice_identities
    WHERE case_deleted_at IS NOT NULL`.append(cursor).append(sql`
    ORDER BY id LIMIT ${pageSize}`)
}

/** One keyset page of due cases in index order; blockers are checked under the case worker's gates. */
export function copyrightCasePurgeAdmissionStatement(
  after: CopyrightCasePurgeAdmissionCursor | undefined,
  pageSize: number,
) {
  const cursor = after
    ? sql`AND (notice.jurisdiction, notice.last_legal_activity_at, notice.id) >
        (${after.jurisdiction}::copyright_jurisdictions,
          ${after.lastLegalActivityAt}::timestamptz, ${after.noticeId}::uuid)`
    : sql``
  return sql`/* admitCopyrightCasePurgePage */
    SELECT notice.id, notice.jurisdiction, notice.last_legal_activity_at
    FROM copyright_notices notice
    WHERE notice.jurisdiction IN ('us_dmca', 'eu_dsa', 'uk')
      AND notice.last_legal_activity_at <=
        ((clock_timestamp() AT TIME ZONE 'UTC')
          - make_interval(months => ${COPYRIGHT_CASE_RETENTION_MONTHS})) AT TIME ZONE 'UTC' `.append(
    cursor,
  ).append(sql`
    ORDER BY notice.jurisdiction, notice.last_legal_activity_at, notice.id
    LIMIT ${pageSize}`)
}

/** One index-ordered admission page; blockers are checked under the case worker's legal gates. */
export async function admitCopyrightCasePurgePage(data: CopyrightCasePurgeAdmissionData): Promise<{
  hasMore: boolean
  next: CopyrightCasePurgeAdmissionData
  admitted: number
  stalled: boolean
}> {
  if (!(await isCopyrightEvidenceRetentionDeletionEnabled()))
    return { hasMore: false, next: data, admitted: 0, stalled: false }
  const counts = await psql.getJobCounts()
  const pageSize = getCopyrightCasePurgePageSize()
  const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
  if (depth >= MAX_PSQL_PENDING) return { hasMore: true, next: data, admitted: 0, stalled: true }
  if (!data.pendingAccountsComplete) {
    const accountCursor = data.pendingAccountAfterId
      ? sql`AND id > ${data.pendingAccountAfterId}::uuid`
      : sql``
    const { rows: accounts } = await read<{ id: string }>(
      sql`
      /* admitCopyrightAccountClockSyncPage */
      SELECT id FROM retained_user_identities
      WHERE is_copyright_case_clock_sync_pending `.append(accountCursor).append(sql`
      ORDER BY id LIMIT ${pageSize}`),
    )
    const page = accounts
    if (page.length > 0)
      await enqueueCopyrightAccountClockSyncBatch(page.map(account => account.id))
    return {
      hasMore: true,
      next: {
        ...data,
        pendingAccountsComplete: accounts.length < pageSize,
        pendingAccountAfterId: accounts.length === pageSize ? page.at(-1)!.id : undefined,
      },
      admitted: page.length,
      stalled: false,
    }
  }
  if (data.caseCandidatesComplete) {
    // Only owners whose case row is gone and whose party cleanup is pending carry the marker, so
    // this read is bounded by unfinished purges, never by the number of cases ever created.
    const { rows: owners } = await read<{ id: string }>(
      copyrightResidualRecoveryStatement(data.orphanAfterId, pageSize),
    )
    if (owners.length > 0) await enqueueCopyrightCasePurgeBatch(owners.map(owner => owner.id))
    return {
      hasMore: owners.length === pageSize,
      next: { ...data, orphanAfterId: owners.at(-1)?.id },
      admitted: owners.length,
      stalled: false,
    }
  }
  const after = data.after
  const { rows } = await read<{
    id: string
    jurisdiction: CopyrightCasePurgeAdmissionCursor['jurisdiction']
    last_legal_activity_at: Date
  }>(copyrightCasePurgeAdmissionStatement(after, pageSize))
  const page = rows
  if (page.length > 0) await enqueueCopyrightCasePurgeBatch(page.map(row => row.id))
  const last = page.at(-1)
  return {
    hasMore: true,
    next: last
      ? {
          ...data,
          caseCandidatesComplete: rows.length < pageSize,
          after: {
            jurisdiction: last.jurisdiction,
            lastLegalActivityAt: last.last_legal_activity_at.toISOString(),
            noticeId: last.id,
          },
        }
      : { ...data, caseCandidatesComplete: true },
    admitted: page.length,
    stalled: false,
  }
}
