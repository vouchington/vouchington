import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Streams repeat-infringer incidents recorded against the user's own account: when each was
 * recorded, whether it is operative, the linked notice id and any recorded disposition. The
 * claimant, the disposition rationale and the reviewer identity are deliberately not selected.
 */
export function streamCopyrightRepeatInfringerIncidents(userId: string) {
  return createAsyncGeneratorFromCursor(sql`/* streamCopyrightRepeatInfringerIncidents */
    SELECT incident.id AS incident_id, incident.copyright_notice_id AS notice_id,
      incident.operative, incident.created_at, disposition.disposition,
      disposition.recorded_at AS disposition_recorded_at
    FROM copyright_repeat_infringer_incidents incident
    LEFT JOIN copyright_repeat_infringer_dispositions disposition
      ON disposition.copyright_repeat_infringer_incident_id = incident.id
    WHERE incident.account_user_id = ${userId}
    ORDER BY incident.id
  `)
}

/**
 * Streams the decided account-level repeat-infringer reviews about the user. Open reviews and the
 * staff rationale and reviewer are withheld; only the outcome and its dates are exported.
 */
export function streamCopyrightRepeatInfringerReviews(userId: string) {
  return createAsyncGeneratorFromCursor(sql`/* streamCopyrightRepeatInfringerReviews */
    SELECT review.id AS review_id, review.opened_at, review.outcome, review.outcome_at
    FROM copyright_repeat_infringer_reviews review
    WHERE review.account_user_id = ${userId} AND review.outcome IS NOT NULL
    ORDER BY review.id
  `)
}
