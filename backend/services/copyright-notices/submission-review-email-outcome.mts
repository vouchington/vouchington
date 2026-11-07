import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

export async function createEmailSubmitterOutcomeInTransaction(
  input: { noticeId: string; submissionId: string; bodyText: string; idempotencyKey: string },
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const { rows } = await transaction<{
    sender_email_ciphertext: string
    amazon_ses_message_id: string
  }>(sql`/* createEmailSubmitterOutcomeInTransaction:recipient */
    SELECT parse.sender_email_ciphertext, intake.amazon_ses_message_id
    FROM copyright_notice_correspondence_messages correspondence
    JOIN copyright_notice_email_intakes intake
      ON intake.id = correspondence.copyright_notice_email_intake_id
    JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE correspondence.copyright_notice_submission_id = ${input.submissionId}
      AND correspondence.direction = 'inbound'
    ORDER BY correspondence.id
    LIMIT 1
  `)
  const recipient = rows[0]
  if (!recipient) return
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceKind: 'status_update',
      bodyText: input.bodyText,
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'correspondent',
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: input.idempotencyKey,
      recipientEmail: decryptSecret(
        recipient.sender_email_ciphertext,
        copyrightEmailIntakePurpose(recipient.amazon_ses_message_id),
      ),
    },
    transaction,
  )
}

export function assertBoundedRationale(value: string): void {
  assert(value.trim() && value.length <= 10_000, 422, 'rationale is required')
}
