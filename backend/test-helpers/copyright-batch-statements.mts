import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordRestrictionAppealReversalEvents } from '../services/copyright-notices/claimant-misuse-ledger.mts'

/** Records an empty batch, then the same batch twice, and counts the notice's events. */
export async function recordTestAppealReversalEventsTwice(input: {
  noticeId: string
  restrictionIds: string[]
}): Promise<number> {
  const batch = { ...input, recordedAt: new Date() }
  await using transaction = await beginTransaction()
  await recordRestrictionAppealReversalEvents(transaction, { ...batch, restrictionIds: [] })
  await recordRestrictionAppealReversalEvents(transaction, batch)
  await recordRestrictionAppealReversalEvents(transaction, batch)
  const { rows } = await transaction<{ total: number }>(sql`/* countTestAppealReversalEvents */
    SELECT count(*)::int AS total FROM copyright_claimant_misuse_events
    WHERE copyright_notice_id = ${input.noticeId}
  `)
  return rows[0]?.total ?? 0
}
