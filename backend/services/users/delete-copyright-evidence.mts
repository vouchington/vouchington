import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
import type { TransactionQuery } from '@data-stores/psql'

/**
 * Refuses (409) while an is_operative repeat-infringer incident, an unresolved qualifying court/CCB
 * hold, or an open staff-placed legal-process preservation hold covers the account. The message is
 * deliberately generic: naming a preservation hold would tip off the account holder.
 */
export async function assertCopyrightEvidenceAllowsDeletion(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const statement = sql`
    /* deleteUser:copyrightEvidence */
    SELECT (
      EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_incidents
        WHERE account_user_id = ${userId} AND is_operative
      )
      OR EXISTS (
        SELECT 1 FROM user_legal_preservation_holds
        WHERE account_user_id = ${userId} AND released_at IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM copyright_notice_targets target
        CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('retain'))
  statement.append(sql` party
        JOIN copyright_notice_legal_hold_assessment_targets hold_target
          ON hold_target.copyright_notice_target_id = target.id
        JOIN copyright_notice_legal_hold_assessments hold
          ON hold.id = hold_target.copyright_notice_legal_hold_assessment_id
        LEFT JOIN copyright_notice_legal_hold_resolutions resolved
          ON resolved.copyright_notice_legal_hold_assessment_id = hold.id
        WHERE party.user_id = ${userId}
          AND resolved.id IS NULL
          AND hold.is_from_original_claimant
          AND hold.is_same_material
          AND hold.proceeding_kind IS NOT NULL
          AND hold.commenced_at IS NOT NULL
          AND hold.received_by_designated_agent_at IS NOT NULL
      )
    ) AS blocked
  `)
  const { rows } = await query<{ blocked: boolean }>(statement)
  assert(
    !rows[0]?.blocked,
    409,
    'Account deletion is blocked while a copyright incident or legal hold is unresolved',
  )
}
