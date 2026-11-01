import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PartyProof = {
  account_user_id: string
  blocked: boolean
}

/** Verify one indexed case-party page before any irreversible evidence deletion. */
export async function verifyCopyrightCasePartyPage(
  query: TransactionQuery,
  noticeId: string,
  afterAccountUserId: string | null,
  pageSize: number,
): Promise<{ nextId: string | null; hasMore: boolean; blocked: boolean; clockAdvanced: boolean }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error('Invalid copyright party verification page size')
  const cursor =
    afterAccountUserId === null
      ? sql``
      : sql` AND party.account_user_id > ${afterAccountUserId}::uuid`
  const { rows } = await query<PartyProof>(
    sql`/* verifyCopyrightCasePartyPage */
    WITH party_page AS MATERIALIZED (
      SELECT party.account_user_id, party.is_incident_party
      FROM copyright_notice_party_identities party
      WHERE party.copyright_notice_id = ${noticeId}::uuid`.append(cursor).append(sql`
      ORDER BY party.account_user_id LIMIT ${pageSize}
    )
    SELECT page.account_user_id,
      COALESCE(hold.id IS NOT NULL
        OR (page.is_incident_party AND (
          state.current_open_review_identity_id IS NOT NULL
          OR state.is_termination_in_effect
          OR EXISTS (
            SELECT 1 FROM user_suspensions suspension
            WHERE suspension.user_id = page.account_user_id
              AND suspension.lifted_at IS NULL
              AND suspension.reason IN (
                'Copyright repeat-infringer review recorded restrict',
                'Copyright repeat-infringer review recorded terminate')
          )
        )), false) AS blocked
    FROM party_page page
    LEFT JOIN user_legal_preservation_holds hold
      ON hold.account_user_id = page.account_user_id AND hold.released_at IS NULL
    LEFT JOIN copyright_repeat_infringer_account_states state
      ON state.account_user_id = page.account_user_id
    ORDER BY page.account_user_id`),
  )
  const ids = rows.map(row => row.account_user_id)
  let clockAdvanced = false
  if (ids.length > 0) {
    const { rows: advanced } = await query<{ id: string }>(sql`
      /* advanceCopyrightCaseClockFromVerifiedParties */
      WITH party_clock AS (
        SELECT max(GREATEST(identity.last_legal_preservation_hold_released_at,
          identity.purged_at)) AS at
        FROM retained_user_identities identity WHERE identity.id = ANY(${ids}::uuid[])
      )
      UPDATE copyright_notices notice
      SET last_legal_activity_at = GREATEST(notice.last_legal_activity_at, party_clock.at)
      FROM party_clock
      WHERE notice.id = ${noticeId}::uuid AND party_clock.at > notice.last_legal_activity_at
      RETURNING notice.id`)
    clockAdvanced = advanced.length > 0
  }
  return {
    nextId: rows.at(-1)?.account_user_id ?? null,
    hasMore: rows.length === pageSize,
    blocked: rows.some(row => row.blocked),
    clockAdvanced,
  }
}
