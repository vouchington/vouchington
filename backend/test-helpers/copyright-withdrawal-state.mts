import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readApiGuestState } from './copyright-api-guest-state.mts'

export function orderWithdrawalAudits<
  T extends {
    kind: string
    capability?: string | null
    submission?: string | null
    correspondence?: string | null
  },
>(events: T[]) {
  return events.toSorted(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      String(a.capability ?? a.submission ?? a.correspondence).localeCompare(
        String(b.capability ?? b.submission ?? b.correspondence),
      ),
  )
}
/** Full owned and unrelated case state; audit order is semantic because revocation's UPDATE is unordered. */
export async function readWithdrawalState(noticeIds: string[]) {
  const [ownedId, foreignId] = noticeIds
  if (noticeIds.length !== 2 || !ownedId || !foreignId)
    throw new Error('Withdrawal state requires exactly its owned and foreign case')
  const readCase = async (noticeId: string) => {
    const [state, { rows: misuse }] = await Promise.all([
      readApiGuestState(noticeId),
      write(
        sql`/* readWithdrawalState:misuse */ SELECT * FROM copyright_claimant_misuse_events WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
      ),
    ])
    const { lifecycleEvents, ...aggregate } = state.aggregate
    const audits = orderWithdrawalAudits(
      lifecycleEvents.map(row => ({
        kind: row.change_type,
        actor: row.changed_by_id,
        capability: row.copyright_notice_guest_capability_id,
        submission: row.copyright_notice_submission_id,
        correspondence: row.copyright_notice_correspondence_id,
        action: row.copyright_notice_action_intent_id,
      })),
    )
    return { ...state, aggregate, audits, misuse }
  }
  return Promise.all([readCase(ownedId), readCase(foreignId)])
}
