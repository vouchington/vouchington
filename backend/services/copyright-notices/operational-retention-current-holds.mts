import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'

/** Current preservation for every live or retained party of this case; releases are not holds. */
export function copyrightThreadCurrentPreservationAllowedSql(noticeId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM copyright_case_preservation_holds held
    WHERE held.copyright_notice_id = ${noticeId}::uuid AND held.released_at IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM user_legal_preservation_holds held
    WHERE held.released_at IS NULL AND (
      EXISTS (SELECT 1 FROM copyright_notice_party_identities party
        WHERE party.copyright_notice_id = ${noticeId}::uuid AND party.account_user_id = held.account_user_id)
      OR EXISTS (SELECT 1 FROM copyright_notices notice
        WHERE notice.id = ${noticeId}::uuid AND notice.claimant_user_id = held.account_user_id)
      OR EXISTS (SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.copyright_notice_id = ${noticeId}::uuid AND submission.submitted_by_id = held.account_user_id)
      OR EXISTS (SELECT 1 FROM copyright_repeat_infringer_incidents incident
        WHERE incident.copyright_notice_id = ${noticeId}::uuid AND incident.account_user_id = held.account_user_id)
      OR EXISTS (SELECT 1 FROM copyright_notice_targets target
        CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain')).append(sql` party
        WHERE target.copyright_notice_id = ${noticeId}::uuid AND party.user_id = held.account_user_id)
    )
  )`)
}
