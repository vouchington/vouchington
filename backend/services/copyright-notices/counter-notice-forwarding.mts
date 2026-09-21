import { decryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

/** Called only by the qualifying-deadline transaction after human compliance review. */
export async function createCounterNoticeForwardingInTransaction(
  input: { assessmentId: string; earliestRestorationAt: Date },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    notice_id: string
    submission_id: string
    body_ciphertext: string
    delivery_intent_id: string
    email_ciphertext: string
  }>(sql`/* createCounterNoticeForwardingInTransaction:counterAndClaimant */
    SELECT submission.copyright_notice_id AS notice_id, submission.id AS submission_id,
      submission.body_ciphertext, recipient.copyright_notice_delivery_intent_id AS delivery_intent_id,
      recipient.email_ciphertext
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notice_deadlines deadline
      ON deadline.qualifying_counter_notice_assessment_id = assessment.id
    JOIN copyright_notice_delivery_intents receipt
      ON receipt.copyright_notice_id = submission.copyright_notice_id
      AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
      AND receipt.delivery_kind = 'claimant_receipt'
    JOIN copyright_notice_delivery_recipients recipient
      ON recipient.copyright_notice_delivery_intent_id = receipt.id
    WHERE assessment.id = ${input.assessmentId}
      AND assessment.assessed_by_id IS NOT NULL
      AND assessment.substantially_compliant
      AND submission.kind = 'counter_notice'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
    ORDER BY receipt.id
    LIMIT 1
  `)
  const row = rows[0]
  assert(row, 422, 'A compliant counter-notice requires a claimant delivery recipient')
  const counterNotice = JSON.parse(
    decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
  ) as {
    name: string
    address: string
    telephone: string
    consentToFederalJurisdiction: boolean
    consentToServiceOfProcess: boolean
    goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
    electronicSignature: string
  }
  const { rows: targets } = await transaction<{ id: string; hosted_use_url: string }>(
    sql`/* createCounterNoticeForwardingInTransaction:targets */
      SELECT target.id, target.hosted_use_url
      FROM copyright_notice_counter_notice_assessment_targets scoped
      JOIN copyright_notice_targets target ON target.id = scoped.copyright_notice_target_id
      JOIN copyright_notice_submission_assessments assessment
        ON assessment.id = scoped.copyright_notice_submission_assessment_id
      WHERE assessment.id = ${input.assessmentId}
      ORDER BY target.id
    `,
  )
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: row.notice_id,
      submissionId: row.submission_id,
      correspondenceKind: 'counter_notice_forwarding',
      bodyText: renderCounterNoticeForwarding(counterNotice, targets, input.earliestRestorationAt),
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId: row.notice_id,
      submissionId: row.submission_id,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'counter_notice_forwarding',
      channel: 'email',
      idempotencyKey: `copyright-assessment:${input.assessmentId}:claimant-forwarding`,
      recipientEmail: decryptSecret(
        row.email_ciphertext,
        `copyright-delivery-recipient:${row.delivery_intent_id}`,
      ),
    },
    transaction,
  )
}

function renderCounterNoticeForwarding(
  notice: {
    name: string
    address: string
    telephone: string
    consentToFederalJurisdiction: boolean
    consentToServiceOfProcess: boolean
    goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
    electronicSignature: string
  },
  targets: Array<{ id: string; hosted_use_url: string }>,
  earliestRestorationAt: Date,
): string {
  return [
    'Voucha received the following counter-notice under 17 U.S.C. 512(g).',
    '',
    `Name: ${notice.name}`,
    `Address: ${notice.address}`,
    `Telephone: ${notice.telephone}`,
    'Material identified for restoration:',
    ...targets.flatMap(target => [
      `- Target ID: ${target.id}`,
      `  Hosted URL: ${target.hosted_use_url}`,
    ]),
    `Statement under penalty of perjury: I have a good faith belief that the material was removed or disabled as a result of mistake or misidentification. ${notice.goodFaithMisidentificationUnderPenaltyOfPerjury ? 'Accepted.' : 'Not accepted.'}`,
    `Consent to federal jurisdiction: I consent to the jurisdiction of the Federal District Court for the judicial district in which my address is located. ${notice.consentToFederalJurisdiction ? 'Accepted.' : 'Not accepted.'}`,
    `Consent to service of process: I will accept service of process from the person who provided the notification under subsection (c)(1)(C), or an agent of that person. ${notice.consentToServiceOfProcess ? 'Accepted.' : 'Not accepted.'}`,
    `Electronic signature: ${notice.electronicSignature}`,
    '',
    `Unless we receive qualifying notice of a court action before then, we may restore the material on or after ${earliestRestorationAt.toISOString()}.`,
  ].join('\n')
}
