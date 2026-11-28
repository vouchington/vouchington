import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getCopyrightSweepLimits } from './work-limits.mts'

type ParticipantNoticeSubmissionSummary = {
  id: string
  kind: FiniteValue<'copyright_notice_submission_kinds'>
  received_at: Date
  source_kind: FiniteValue<'copyright_notice_submission_source_kinds'>
}

export async function collectKeysetPages<Row, Cursor>(
  pageSize: number,
  fetchPage: (cursor: Cursor | null, limit: number) => Promise<Row[]>,
  getNextCursor: (lastRow: Row) => Cursor,
): Promise<Row[]> {
  const all: Row[] = []
  let cursor: Cursor | null = null
  while (true) {
    // oxlint-disable no-await-in-loop -- keyset page advances sequentially until a short page ends the scan
    const page = await fetchPage(cursor, pageSize)
    // oxlint-enable no-await-in-loop
    all.push(...page)
    if (page.length < pageSize) break
    cursor = getNextCursor(page.at(-1)!)
  }
  return all
}

export async function drainBatchedWrite(
  batchSize: number,
  runBatch: (limit: number) => Promise<number>,
): Promise<number> {
  let total = 0
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch write drains matching rows sequentially until a short page ends the loop
    const count = await runBatch(batchSize)
    // oxlint-enable no-await-in-loop
    total += count
    if (count < batchSize) break
  }
  return total
}

export async function selectSubmissionTargetIds(
  query: QueryExecutor,
  submissionId: string,
): Promise<string[]> {
  const rows = await collectKeysetPages<{ copyright_notice_target_id: string }, string>(
    getCopyrightSweepLimits().batchSize,
    async (afterTargetId, limit) => {
      const { rows: page } = await query<{ copyright_notice_target_id: string }>(sql`
        /* selectCopyrightSubmissionTargetIds */
        SELECT copyright_notice_target_id
        FROM copyright_notice_submission_targets
        WHERE copyright_notice_submission_id = ${submissionId}
          AND (${afterTargetId}::uuid IS NULL OR copyright_notice_target_id > ${afterTargetId}::uuid)
        ORDER BY copyright_notice_target_id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => row.copyright_notice_target_id,
  )
  return rows.map(row => row.copyright_notice_target_id)
}

export async function selectSubmissionTargetIdsBySubmission(
  query: TransactionQuery,
  submissionIds: readonly string[],
): Promise<Map<string, string[]>> {
  const bySubmission = new Map<string, string[]>()
  if (submissionIds.length === 0) return bySubmission
  const rows = await collectKeysetPages<
    { copyright_notice_submission_id: string; copyright_notice_target_id: string },
    { submissionId: string; targetId: string }
  >(
    getCopyrightSweepLimits().batchSize,
    async (cursor, limit) => {
      const { rows: page } = await query<{
        copyright_notice_submission_id: string
        copyright_notice_target_id: string
      }>(sql`/* selectCopyrightSubmissionTargetsBySubmission */
        SELECT copyright_notice_submission_id, copyright_notice_target_id
        FROM copyright_notice_submission_targets
        WHERE copyright_notice_submission_id = ANY(${submissionIds}::uuid[])
          AND (
            ${cursor?.submissionId ?? null}::uuid IS NULL
            OR (copyright_notice_submission_id, copyright_notice_target_id)
              > (${cursor?.submissionId ?? null}::uuid, ${cursor?.targetId ?? null}::uuid)
          )
        ORDER BY copyright_notice_submission_id ASC, copyright_notice_target_id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => ({
      submissionId: row.copyright_notice_submission_id,
      targetId: row.copyright_notice_target_id,
    }),
  )
  for (const row of rows) {
    const list = bySubmission.get(row.copyright_notice_submission_id) ?? []
    list.push(row.copyright_notice_target_id)
    bySubmission.set(row.copyright_notice_submission_id, list)
  }
  return bySubmission
}

export async function selectParticipantNoticeSubmissions(
  noticeId: string,
  userId: string,
  isStaff: boolean,
  transaction: TransactionQuery,
): Promise<ParticipantNoticeSubmissionSummary[]> {
  return collectKeysetPages<ParticipantNoticeSubmissionSummary, { receivedAt: Date; id: string }>(
    getCopyrightSweepLimits().batchSize,
    async (cursor, limit) => {
      const { rows } = await transaction<ParticipantNoticeSubmissionSummary>(
        sql`/* getCopyrightParticipantNoticeDetail:submissions */
          SELECT id, kind, received_at, source_kind
          FROM copyright_notice_submissions
          WHERE copyright_notice_id = ${noticeId}
            AND (${isStaff} OR submitted_by_id = ${userId})
            AND (
              ${cursor?.id ?? null}::uuid IS NULL
              OR (received_at, id) > (${cursor?.receivedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
            )
          ORDER BY received_at ASC, id ASC
          LIMIT ${limit}
        `,
      )
      return rows
    },
    row => ({ receivedAt: row.received_at, id: row.id }),
  )
}

export async function selectParticipantRespondableTargetIds(
  noticeId: string,
  userId: string,
  transaction: TransactionQuery,
): Promise<string[]> {
  const rows = await collectKeysetPages<{ id: string }, string>(
    getCopyrightSweepLimits().batchSize,
    async (afterId, limit) => {
      const targetSql = sql`/* getCopyrightParticipantNoticeDetail:respondableTargets */
        SELECT DISTINCT target.id
        FROM copyright_notice_targets target
        CROSS JOIN LATERAL `
      targetSql.append(copyrightPlacementPartiesSql('respond'))
      targetSql.append(sql` party
        WHERE target.copyright_notice_id = ${noticeId}
          AND party.user_id = ${userId}
          AND (${afterId}::uuid IS NULL OR target.id > ${afterId}::uuid)
        ORDER BY target.id ASC
        LIMIT ${limit}`)
      const { rows: page } = await transaction<{ id: string }>(targetSql)
      return page
    },
    row => row.id,
  )
  return rows.map(row => row.id)
}

export async function selectNoticeTargetUrls(
  query: QueryExecutor,
  noticeId: string,
  targetIds: readonly string[] | null,
): Promise<string[]> {
  const rows = await collectKeysetPages<{ id: string; hosted_use_url: string }, string>(
    getCopyrightSweepLimits().batchSize,
    async (afterId, limit) => {
      const { rows: page } = await query<{ id: string; hosted_use_url: string }>(sql`
        /* getCopyrightSubmissionGuidanceSource:targets */
        SELECT target.id, target.hosted_use_url
        FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = ${noticeId}
          AND (${targetIds}::uuid[] IS NULL OR target.id = ANY(${targetIds}::uuid[]))
          AND (${afterId}::uuid IS NULL OR target.id > ${afterId}::uuid)
        ORDER BY target.id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => row.id,
  )
  return rows.map(row => row.hosted_use_url)
}
