import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from './copyright-placement-parties.mts'

/**
 * The body of a `preservation(notice_id, released_at)` CTE: one row per legal-process preservation
 * hold (open, or released at `released_at`) on an account that is a party to a case. A party is the
 * signed-in claimant, the account that submitted any submission of the case, the account of a
 * repeat-infringer incident raised on it, or the author of a post a target placement belongs to.
 * The last arm is the join `assertCopyrightEvidenceAllowsDeletion` uses for account deletion, so
 * the sweep and account deletion agree on whose records a hold covers.
 *
 * Each arm starts from the holds, which are few, and reaches the case through an indexed account
 * column. Holds are never deleted, so a released hold still marks when the case last stopped being
 * preserved: the retention clock waits from that time.
 */
export const COPYRIGHT_PRESERVATION_PARTIES_SQL = sql`
      SELECT party.copyright_notice_id AS notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_notice_party_identities party ON party.account_user_id = hold.account_user_id
      JOIN copyright_notices notice ON notice.id = party.copyright_notice_id
      UNION ALL
      SELECT notice.id AS notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_notices notice ON notice.claimant_user_id = hold.account_user_id
      UNION ALL
      SELECT submission.copyright_notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_notice_submissions submission
        ON submission.submitted_by_id = hold.account_user_id
      UNION ALL
      SELECT incident.copyright_notice_id, hold.released_at
      FROM user_legal_preservation_holds hold
      JOIN copyright_repeat_infringer_incidents incident
        ON incident.account_user_id = hold.account_user_id
      UNION ALL
      SELECT target.copyright_notice_id, hold.released_at
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain')).append(sql` party
      JOIN user_legal_preservation_holds hold ON hold.account_user_id = party.user_id
    `)
