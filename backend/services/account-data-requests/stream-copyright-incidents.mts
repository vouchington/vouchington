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
      incident.is_operative, incident.created_at,
      incident.current_disposition AS disposition,
      incident.current_disposition_recorded_at AS disposition_recorded_at
    FROM copyright_repeat_infringer_incidents incident
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
    SELECT review.copyright_repeat_infringer_review_identity_id AS review_id,
      review.opened_at, review.outcome, review.outcome_at
    FROM copyright_repeat_infringer_reviews review
    WHERE review.account_user_id = ${userId}
    UNION ALL
    SELECT account_state.current_decided_review_identity_id AS review_id,
      identity.created_at AS opened_at,
      account_state.current_outcome AS outcome,
      account_state.current_outcome_at AS outcome_at
    FROM copyright_repeat_infringer_account_states account_state
    JOIN copyright_repeat_infringer_review_identities identity
      ON identity.id = account_state.current_decided_review_identity_id
    WHERE account_state.account_user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_reviews review
        WHERE review.copyright_repeat_infringer_review_identity_id = identity.id
      )
    ORDER BY review_id
  `)
}
