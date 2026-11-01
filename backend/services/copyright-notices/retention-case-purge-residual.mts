import { beginBoundedTransaction } from '@data-stores/psql'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { getCopyrightCasePurgePageSize } from '../../queues/psql/enqueues/ordering-config.mts'
import sql from 'sql-template-strings'

/** Same-job cleanup of finite party links after the live case root is gone. */
export async function deleteCopyrightCaseResidualPartyPage(data: CopyrightCasePurgeJobData) {
  const pageSize = getCopyrightCasePurgePageSize()
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  const { rows: live } = await query<{ id: string }>(sql`/* recheckCopyrightCaseResidualRoot */
    SELECT id FROM copyright_notices WHERE id = ${data.noticeId}::uuid FOR UPDATE`)
  if (live.length > 0) {
    await query.commit()
    return { data: { ...data, phase: 'final' as const, afterId: null }, hasMore: true }
  }
  const cursor =
    data.afterId === null ? sql`` : sql` AND party.account_user_id > ${data.afterId}::uuid`
  const { rows: parties } = await query<{ account_user_id: string }>(
    sql`
    /* readCopyrightCaseResidualPartyPage */
    SELECT party.account_user_id FROM copyright_notice_party_identities party
    WHERE party.copyright_notice_id = ${data.noticeId}::uuid`.append(cursor).append(sql`
    ORDER BY party.account_user_id LIMIT ${pageSize} FOR UPDATE`),
  )
  const ids = parties.map(party => party.account_user_id)
  if (ids.length > 0) {
    await query(sql`/* deleteCopyrightCaseResidualPartyPage */
      DELETE FROM copyright_notice_party_identities
      WHERE copyright_notice_id = ${data.noticeId}::uuid
        AND account_user_id = ANY(${ids}::uuid[])`)
  }
  if (parties.length < pageSize) {
    await query(sql`/* deleteRetainedCopyrightCaseIdentity */
      DELETE FROM retained_copyright_notice_identities owner
      WHERE owner.id = ${data.noticeId}::uuid
        AND NOT EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.id = owner.id)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_party_identities party
          WHERE party.copyright_notice_id = owner.id)`)
  }
  await query.commit()
  return {
    data: {
      ...data,
      phase: 'residual_parties' as const,
      afterId: parties.at(-1)?.account_user_id ?? null,
    },
    hasMore: parties.length === pageSize,
  }
}
