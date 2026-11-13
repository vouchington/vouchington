import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export type EffectiveAccountState = {
  id: string
  live: boolean
  incidents: { notice: string; operative: boolean; disposition: string | null }[]
  open: string[]
  reviews: (string | null)[]
}

/** Owned case and account facts, including every audit/notice/action written by a review. */
export async function readEffectiveReviewState(noticeId: string, accountIds: string[]) {
  const [
    state,
    aggregate,
    { rows: accounts },
    { rows: misuse },
    { rows: provenance },
    { rows: dispositions },
  ] = await Promise.all([
    readCopyrightAssessmentRaceState(noticeId),
    getCopyrightNoticePrivateAggregate(noticeId),
    write<EffectiveAccountState>(sql`/* readEffectiveReviewState:accounts */
    SELECT account.id, account.deleted_at IS NULL AS live,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('notice', copyright_notice_id,
        'operative', is_operative, 'disposition', current_disposition) ORDER BY copyright_notice_id)
        FROM copyright_repeat_infringer_incidents WHERE account_user_id = account.id), '[]'::jsonb) AS incidents,
      ARRAY(SELECT current_open_review_identity_id::text FROM copyright_repeat_infringer_account_states
        WHERE account_user_id = account.id AND current_open_review_identity_id IS NOT NULL) AS open,
      COALESCE((SELECT jsonb_agg(review.outcome ORDER BY identity.id)
        FROM copyright_repeat_infringer_review_identities identity
        LEFT JOIN copyright_repeat_infringer_reviews review ON review.copyright_repeat_infringer_review_identity_id = identity.id
        WHERE identity.account_user_id = account.id), '[]'::jsonb) AS reviews
    FROM users account WHERE account.id = ANY(${accountIds}::uuid[]) ORDER BY account.id`),
    write<{
      restriction: string
      outcome: string
    }>(sql`/* readEffectiveReviewState:misuse */
    SELECT copyright_restriction_id AS restriction, outcome FROM copyright_claimant_misuse_events
    WHERE copyright_notice_id = ${noticeId} ORDER BY copyright_restriction_id`),
    write<{
      account: string
      target: string
    }>(sql`/* readEffectiveReviewState:provenance */
    SELECT incident.account_user_id AS account, provenance.copyright_notice_target_id AS target
    FROM copyright_repeat_infringer_incident_targets provenance
    JOIN copyright_repeat_infringer_incidents incident ON incident.id = provenance.copyright_repeat_infringer_incident_id
    WHERE provenance.copyright_notice_id = ${noticeId} ORDER BY incident.account_user_id, provenance.copyright_notice_target_id`),
    write<{
      account: string
      disposition: string
      reviewer: string
    }>(sql`/* readEffectiveReviewState:dispositions */
    SELECT incident.account_user_id AS account, disposition.disposition, disposition.recorded_by_id AS reviewer
    FROM copyright_repeat_infringer_dispositions disposition
    JOIN copyright_repeat_infringer_incidents incident ON incident.id = disposition.copyright_repeat_infringer_incident_id
    WHERE incident.copyright_notice_id = ${noticeId} ORDER BY incident.account_user_id`),
  ])
  if (!aggregate) throw new Error('Owned case disappeared')
  return {
    state,
    accounts,
    misuse,
    provenance,
    dispositions,
    appeals: aggregate.appealReviews.map(row => ({
      id: row.id,
      submission: row.copyright_notice_submission_id,
      restriction: row.copyright_restriction_id,
      action: row.action,
      reviewer: row.reviewed_by_id,
    })),
  }
}
