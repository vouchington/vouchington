import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
} from './index.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-responses.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

describe('copyright email intake responses', () => {
  it('reuses the stored response when the same intake is inserted twice', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const sesMessageId = `ses-response-conflict-${crypto.randomUUID()}`
    const fromEmail = `claimant-${crypto.randomUUID()}@example.test`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 5),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail,
      subject: 'Copyright complaint',
      bodyText: 'A copyright complaint.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    const rejected = await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'The extraction agent was unavailable.',
      rationale: 'The message lacks the required declarations.',
      responseKind: 'rejected',
      responseMessage: null,
    })
    if (!rejected.responseId) throw new Error('response was not created')
    await using transaction = await beginTransaction()
    const existing = await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        intakeSesMessageId: sesMessageId,
        senderEmailCiphertext: encryptSecret(fromEmail, copyrightEmailIntakePurpose(sesMessageId)),
        responseKind: 'rejected',
        responseMessage: null,
      },
      transaction,
    )
    await transaction.commit()
    expect(existing.id).toBe(rejected.responseId)
  })
})
