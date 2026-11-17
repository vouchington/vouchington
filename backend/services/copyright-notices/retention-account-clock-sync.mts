import { lockCopyrightActionGenerationsForWrite } from './action-delivery-generation.mts'
import { beginBoundedTransaction, type QueryExecutor } from '@data-stores/psql'
import type { CopyrightAccountClockSyncJobData } from '../../queues/psql/types.mts'
import { getCopyrightCasePurgePageSize } from '@queues/psql/enqueues/ordering-config'
import sql from 'sql-template-strings'

type Source = {
  id: string
  pending: boolean
  last_legal_preservation_hold_released_at: string | null
  purged_at: string | null
  active_hold_id: string | null
  active_hold_created_at: string | null
}

/** Propagates one account's latest legal clock through one indexed party page. */
export async function runCopyrightAccountClockSyncPage(
  data: CopyrightAccountClockSyncJobData,
): Promise<{ data: CopyrightAccountClockSyncJobData; hasMore: boolean }> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  const source = await readSource(query, data.accountUserId)
  if (!source?.pending) {
    await query.commit()
    return { data, hasMore: false }
  }
  const sourceVersion = version(source)
  const afterNoticeId = data.sourceVersion === sourceVersion ? data.afterNoticeId : null
  const pageSize = getCopyrightCasePurgePageSize()
  const cursor =
    afterNoticeId === null ? sql`` : sql` AND party.copyright_notice_id > ${afterNoticeId}::uuid`
  const { rows: parties } = await query<{ copyright_notice_id: string }>(
    sql`
    /* readCopyrightAccountClockSyncPartyPage */
    SELECT party.copyright_notice_id
    FROM copyright_notice_party_identities party
    WHERE party.account_user_id = ${data.accountUserId}::uuid`.append(cursor).append(sql`
    ORDER BY party.copyright_notice_id LIMIT ${pageSize}`),
  )
  const noticeIds = parties.map(party => party.copyright_notice_id)
  if (noticeIds.length > 0) {
    await lockCopyrightActionGenerationsForWrite(noticeIds, query)
    await query(sql`/* advanceCopyrightAccountCaseClocks */
      UPDATE copyright_notices notice
      SET last_legal_activity_at = GREATEST(
        notice.last_legal_activity_at,
        ${source.active_hold_created_at}::timestamptz,
        ${source.last_legal_preservation_hold_released_at}::timestamptz,
        ${source.purged_at}::timestamptz)
      WHERE notice.id = ANY(${noticeIds}::uuid[])`)
  }
  if (parties.length < pageSize) {
    const { rows: acknowledged } = await query<{
      id: string
    }>(sql`/* completeCopyrightAccountClockSync */
      UPDATE retained_user_identities
      SET is_copyright_case_clock_sync_pending = false
      WHERE id = ${data.accountUserId}::uuid AND is_copyright_case_clock_sync_pending
      RETURNING id`)
    // This separate statement sees a hold committed while acknowledgement waited.
    // A later hold waits on the actual identity write, then marks it pending again.
    const current = await readSource(query, data.accountUserId)
    if (acknowledged.length === 0) {
      return { data, hasMore: current?.pending === true }
    }
    if (!current || version(current) !== sourceVersion) {
      return { data: { ...data, sourceVersion }, hasMore: true }
    }
  }
  await query.commit()
  return {
    data: {
      accountUserId: data.accountUserId,
      afterNoticeId: parties.at(-1)?.copyright_notice_id ?? null,
      sourceVersion,
    },
    hasMore: parties.length === pageSize,
  }
}

async function readSource(
  query: QueryExecutor,
  accountUserId: string,
): Promise<Source | undefined> {
  const { rows } = await query<Source>(sql`/* readCopyrightAccountClockSyncSource */
    SELECT identity.id,
      identity.is_copyright_case_clock_sync_pending AS pending,
      identity.last_legal_preservation_hold_released_at::text,
      identity.purged_at::text,
      hold.id AS active_hold_id,
      hold.created_at::text AS active_hold_created_at
    FROM retained_user_identities identity
    LEFT JOIN user_legal_preservation_holds hold
      ON hold.account_user_id = identity.id AND hold.released_at IS NULL
    WHERE identity.id = ${accountUserId}::uuid`)
  return rows[0]
}

function version(source: Source): string {
  // PostgreSQL text retains timestamp precision beyond JavaScript milliseconds.
  return JSON.stringify([
    source.active_hold_id,
    source.active_hold_created_at,
    source.last_legal_preservation_hold_released_at,
    source.purged_at,
  ])
}
