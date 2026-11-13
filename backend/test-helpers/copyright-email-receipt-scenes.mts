import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { failTestCopyrightDeliveryIntent } from './data-stores/psql/copyright-notice-reads.mts'
import { ownedCopyrightEmailPromotionInput } from './copyright-promotion-committed-fixtures.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../services/copyright-notices/email-intake-reply.mts'
import { buildCopyrightEmailThreadReferenceRows } from '../services/copyright-notices/email-thread-references.mts'
import {
  resolveCopyrightEmailThreadTokenIds,
  insertResolvedCopyrightEmailThreadReferences,
} from '../services/copyright-notices/email-thread-ancestors.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { seedOwnedCopyrightReplyClaim } from './copyright-reply-replay-fixtures.mts'

/** Receipt presence represents the committed arrival stage, not a process-global feature toggle. */
export async function seedOwnedCopyrightReceiptSource(state: 'pending' | 'failed' | 'none') {
  const intake = await createUnparsedCopyrightEmailIntake()
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const messageId = `<${crypto.randomUUID()}@example.test>`
  await using transaction = await beginTransaction()
  await transaction(sql`/* createOwnedCopyrightReceiptScene:parse */
    INSERT INTO copyright_notice_email_intake_parses (copyright_notice_email_intake_id, status,
      sender_email_ciphertext, subject_ciphertext, body_ciphertext, message_id_ciphertext)
    VALUES (${intake.id}, 'succeeded', ${encryptSecret('claimant@example.test', purpose)},
      ${encryptSecret('Copyright complaint', purpose)}, ${encryptSecret('Original copyright complaint.', purpose)},
      ${encryptSecret(messageId, purpose)})`)
  const references = buildCopyrightEmailThreadReferenceRows({
    messageId,
    inReplyTo: [],
    references: [],
  })
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    references.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, references, tokens)
  const arrivalId =
    state === 'none'
      ? null
      : await createCopyrightEmailIntakeResponseInTransaction(
          {
            intakeId: intake.id,
            recipientEmail: 'claimant@example.test',
            responseKind: 'received',
            responseMessage: null,
          },
          transaction,
        )
  await transaction.commit()
  if (state === 'failed') await failTestCopyrightDeliveryIntent(arrivalId!)
  return { intake, arrivalId }
}

export async function createOwnedCopyrightReceiptScene(state: 'pending' | 'failed' | 'none') {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const source = await seedOwnedCopyrightReceiptSource(state)
  return {
    ...source,
    moderator,
    input: await ownedCopyrightEmailPromotionInput(moderator, source.intake.id),
  }
}

export async function createOwnedCopyrightProviderReply(
  responseKind: 'rejected' | 'needs_information',
) {
  const scene = await seedOwnedCopyrightReceiptSource('pending')
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: scene.intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks required declarations.',
    responseKind,
    responseMessage:
      responseKind === 'needs_information'
        ? 'Please identify the work and the hosted material.'
        : null,
  })
  if (!responseId) throw new Error('Owned provider reply was not created')
  return { intakeId: scene.intake.id, intentId: responseId }
}

/** Completed provider stage for unconditional bounce or stale-lease probes. */
export async function seedOwnedCopyrightProviderStage(
  intentId: string,
  stage: 'sent' | 'retryable_failure',
) {
  await seedOwnedCopyrightReplyClaim(intentId)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    lease_token: string
  }>(sql`/* seedOwnedCopyrightProviderStage:lease */
    SELECT lease_token FROM copyright_notice_delivery_work_items WHERE id = ${intentId}`)
  const token = rows[0]?.lease_token
  if (!token) throw new Error('Owned provider lease is missing')
  const sesMessageId = `ses-${crypto.randomUUID()}`
  if (stage === 'sent')
    await transaction(sql`/* seedOwnedCopyrightProviderStage:sent */
    UPDATE copyright_notice_delivery_work_items SET sent_at = CURRENT_TIMESTAMP, amazon_ses_message_id = ${sesMessageId}
    WHERE id = ${intentId} AND state = 'claimed' AND lease_token = ${token}`)
  else
    await transaction(sql`/* seedOwnedCopyrightProviderStage:failed */
    UPDATE copyright_notice_delivery_work_items SET leased_at = NULL,
      available_at = clock_timestamp() + INTERVAL '1 minute',
      failure_ciphertext = ${encryptSecret('The email provider timed out.', `copyright-delivery:${intentId}`)}
    WHERE id = ${intentId} AND state = 'claimed' AND lease_token = ${token}`)
  await transaction.commit()
  return { leaseToken: token, sesMessageId }
}
