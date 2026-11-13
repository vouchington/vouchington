import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import { decryptSecret } from '@modules/token-secrets'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export async function readDisclosureCounterReviewState(noticeId: string) {
  const [legal, aggregate, { rows: scope }] = await Promise.all([
    readEffectiveReviewState(noticeId, []),
    getCopyrightNoticePrivateAggregate(noticeId),
    write<{
      assessment: string
      target: string
    }>(sql`/* readServiceCounterReviewState:scope */
    SELECT scope.copyright_notice_submission_assessment_identity_id AS assessment,
      scope.copyright_notice_target_id AS target
    FROM copyright_notice_counter_notice_assessment_targets scope
    JOIN copyright_notice_submission_assessment_identities identity
      ON identity.id = scope.copyright_notice_submission_assessment_identity_id
    WHERE identity.copyright_notice_id = ${noticeId} ORDER BY assessment, target`),
  ])
  return {
    legal,
    scope,
    bodies: aggregate!.submissions.flatMap(row =>
      row.kind === 'counter_notice'
        ? [
            {
              id: row.id,
              encrypted: row.body_ciphertext,
              text: decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.id)),
            },
          ]
        : [],
    ),
    messages: aggregate!.correspondence.map(row => {
      const text = decryptSecret(row.body_ciphertext, copyrightCorrespondencePurpose(row.id))
      return {
        id: row.id,
        submission: row.copyright_notice_submission_id,
        kind: row.correspondence_kind,
        encrypted: row.body_ciphertext !== text,
        text,
      }
    }),
    reviews: aggregate!.counterNoticeReviews.map(row => ({
      submission: row.copyright_notice_submission_id,
      assessment: row.copyright_notice_submission_assessment_identity_id,
      deadline: row.copyright_notice_deadline_id,
      accepted: row.is_accepted,
      reviewer: row.reviewed_by_id,
      rationale: decryptSecret(
        row.rationale_ciphertext,
        `copyright-counter-review:${row.copyright_notice_submission_id}`,
      ),
    })),
  }
}
