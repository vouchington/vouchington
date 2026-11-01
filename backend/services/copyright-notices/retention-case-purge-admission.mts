import { read } from '@data-stores/psql'
import { psql } from '../../queues/psql/queues.mts'
import { enqueueCopyrightCasePurgeBatch } from '../../queues/psql/enqueues/copyright-case-purge.mts'
import { enqueueCopyrightAccountClockSyncBatch } from '../../queues/psql/enqueues/copyright-account-clock-sync.mts'
import sql from 'sql-template-strings'
import { COPYRIGHT_CASE_RETENTION_MONTHS } from './retention-case-purge-eligibility.mts'
import { isCopyrightEvidenceRetentionDeletionEnabled } from './config.mts'
import { getCopyrightCasePurgePageSize } from '../../queues/psql/enqueues/ordering-config.mts'
import type { CopyrightCasePurgeAdmissionData } from '../../queues/background/enqueues/notifications-domain.mts'

const MAX_PSQL_PENDING = 1_000

type CopyrightCasePurgeAdmissionCursor = NonNullable<CopyrightCasePurgeAdmissionData['after']>

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
      WHERE copyright_case_clock_sync_pending `.append(accountCursor).append(sql`
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
    const orphanCursor = data.orphanAfterId ? sql`WHERE id > ${data.orphanAfterId}::uuid` : sql``
    const { rows: owners } = await read<{ id: string; missing: boolean }>(
      sql`
      /* admitCopyrightResidualCaseRecoveryPage */
      WITH page AS MATERIALIZED (
        SELECT id FROM retained_copyright_notice_identities `.append(orphanCursor).append(sql`
        ORDER BY id LIMIT ${pageSize}
      )
      SELECT page.id, (notice.id IS NULL) AS missing
      FROM page LEFT JOIN copyright_notices notice ON notice.id = page.id
      ORDER BY page.id`),
    )
    const page = owners
    const missing = page.filter(owner => owner.missing)
    if (missing.length > 0) await enqueueCopyrightCasePurgeBatch(missing.map(owner => owner.id))
    return {
      hasMore: owners.length === pageSize,
      next: { ...data, orphanAfterId: page.at(-1)?.id },
      admitted: missing.length,
      stalled: false,
    }
  }
  const after = data.after
  const cursor = after
    ? sql`AND (notice.jurisdiction, notice.last_legal_activity_at, notice.id) >
        (${after.jurisdiction}::copyright_jurisdictions,
          ${after.lastLegalActivityAt}::timestamptz, ${after.noticeId}::uuid)`
    : sql``
  const statement = sql`/* admitCopyrightCasePurgePage */
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
  const { rows } = await read<{
    id: string
    jurisdiction: CopyrightCasePurgeAdmissionCursor['jurisdiction']
    last_legal_activity_at: Date
  }>(statement)
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
