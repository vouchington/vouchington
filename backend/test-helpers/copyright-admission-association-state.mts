import { createRetentionParsedEmail } from './services/copyright-notices/retention-parsed-email.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import {
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from './copyright-email-manual-association.mts'
import { claimActionDeliveryFixture } from './copyright-action-delivery-contract-fixtures.mts'

/** Canonical committed lease prerequisite; the actual failure actor remains the production service. */
export async function claimCopyrightAdmissionRestoreFixture(intentId: string) {
  await using transaction = await beginTransaction()
  await claimActionDeliveryFixture(intentId, transaction)
  const { rows } = await transaction<{ lease_token: string }>(sql`
    /* claimCopyrightAdmissionRestoreFixture */ SELECT lease_token
    FROM copyright_notice_action_work_items WHERE id = ${intentId}`)
  await transaction.commit()
  return rows[0]!
}

/** Include current decisions, source evidence, all legal stages and the entire owned work row. */
export async function readCopyrightAdmissionAssociationState(
  noticeId: string,
  intakeId: string,
  associatedId?: string,
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned admission case is missing')
  const { rows } = await write<{
    session: string
    received_at: Date
    storage: string | null
    digest: Buffer
    mime: string
    size: number
    body: string
  }>(sql`/* readCopyrightAdmissionAssociationState:source */
    SELECT intake.amazon_ses_message_id AS session, intake.received_at, intake.raw_storage_object_id AS storage,
      intake.raw_sha256 AS digest, media.mime_type AS mime, intake.raw_byte_size AS size,
      parse.body_ciphertext AS body FROM copyright_notice_email_intakes intake
    JOIN media_types media ON media.id = intake.raw_media_type_id
    JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    WHERE intake.id = ${intakeId} AND parse.status = 'succeeded'`)
  const source = rows[0]
  if (!source) throw new Error('Owned admission source is missing')
  const { rows: reviews } = await write<{
    id: string
    session: string
    rationale_ciphertext: string
    manual_fallback_reason_ciphertext: string | null
  }>(sql`/* readCopyrightAdmissionAssociationState:reviews */
    SELECT review.*, intake.amazon_ses_message_id AS session
    FROM copyright_notice_email_correspondence_reviews review
    JOIN copyright_notice_email_intakes intake ON intake.id = review.copyright_notice_email_intake_id
    WHERE review.copyright_notice_id = ${noticeId} ORDER BY review.id`)
  const { rows: attempts } = await write<{
    work: string
    attempt_number: number
    generation: string
    completed: boolean
    stale: boolean
    blocked: boolean
    failed: boolean
    abandoned: boolean
  }>(sql`/* readCopyrightAdmissionAssociationState:attempts */
    SELECT attempt.work_item_id AS work, attempt.attempt_number, attempt.generation::text,
      result.completed_at IS NOT NULL AS completed, result.stale_at IS NOT NULL AS stale,
      result.blocked_at IS NOT NULL AS blocked, result.failed_at IS NOT NULL AS failed,
      result.abandoned_at IS NOT NULL AS abandoned
    FROM copyright_notice_action_attempts attempt
    JOIN copyright_notice_action_work_items work ON work.id = attempt.work_item_id
    LEFT JOIN copyright_notice_action_attempt_results result ON result.attempt_id = attempt.id
    WHERE work.copyright_notice_id = ${noticeId} ORDER BY attempt.id`)
  return {
    attempts,
    aggregate: {
      ...aggregate,
      submissions: aggregate.submissions.map(row => ({
        ...row,
        body_ciphertext:
          row.source_kind === 'email' &&
          (row.kind === 'supplement' || row.kind === 'court_or_ccb_hold')
            ? decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.id))
            : row.body_ciphertext,
      })),
      emailCorrespondenceReviews: reviews.map(({ session, ...row }) => ({
        ...row,
        rationale_ciphertext: decryptSecret(
          row.rationale_ciphertext,
          copyrightEmailIntakePurpose(session),
        ),
        manual_fallback_reason_ciphertext: row.manual_fallback_reason_ciphertext
          ? decryptSecret(
              row.manual_fallback_reason_ciphertext,
              copyrightEmailIntakePurpose(session),
            )
          : null,
      })),
    },
    source,
    legal: await readCopyrightAssessmentRaceState(noticeId),
    clock: await readCopyrightCaseLifecycleClock(noticeId),
    admittedDecision: await readCopyrightEmailManualAssociationReview(intakeId),
    associatedLinks: associatedId ? await readCopyrightEmailIntakeNoticeLinks(associatedId) : [],
    associatedDecision: associatedId
      ? await readCopyrightEmailManualAssociationReview(associatedId)
      : [],
    associatedAudit: associatedId
      ? await readCopyrightEmailManualAssociationEvent(associatedId)
      : [],
  }
}

/** Canonical parsed, reference-bearing source dependency without running the threading subject. */
export async function createCopyrightAdmissionReply() {
  const intake = await createRetentionParsedEmail('owned-correspondence-source', {
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [`<${crypto.randomUUID()}@example.test>`],
  })
  return { intakeId: intake.id }
}
