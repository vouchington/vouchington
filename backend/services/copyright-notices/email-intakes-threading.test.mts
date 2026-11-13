import { createTestUser } from '@voucha/test-helpers'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { seedCopyrightPromotionThreadEmail } from '@voucha/test-helpers/copyright-promotion-thread-fixtures'
import {
  seedCommittedCopyrightPromotion,
  ownedCopyrightEmailPromotionInput,
} from '@voucha/test-helpers/copyright-promotion-committed-fixtures'
import { assertCopyrightPromotionGuard } from '@voucha/test-helpers/copyright-email-promotion-outcomes'
import {
  readOwnedCopyrightIntake,
  assertOwnedCopyrightParseReplay,
  assertOwnedCopyrightUnknownParse,
} from '@voucha/test-helpers/copyright-owned-parse-outcomes'
import { describe, expect, it } from 'vitest'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'

describe('copyright email intake threading', () => {
  it('does not let an early reply open a separate initial case before its root is linked', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = `root-${crypto.randomUUID()}@example.test`
    const reply = await seedCopyrightPromotionThreadEmail({
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [`<${rootMessageId}>`],
      bodyText: 'This reply arrived before the original message.',
    })
    const replyInput = await ownedCopyrightEmailPromotionInput(moderator, reply.intakeId)
    await assertCopyrightPromotionGuard(
      { input: replyInput, intakeIds: [reply.intakeId] },
      'Unresolved reply email must wait for its root case',
    )
    const root = await seedCopyrightPromotionThreadEmail({
      messageId: `<${rootMessageId}>`,
      replyReferences: [],
    })
    const promoted = await seedCommittedCopyrightPromotion({
      ...replyInput,
      intakeId: root.intakeId,
      workDescription: `Owned root promotion ${crypto.randomUUID()}`,
    })
    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: promoted.noticeId },
    })
    const spoofedMessageId = `spoofed-${crypto.randomUUID()}@example.test`
    await assertOwnedCopyrightParseReplay(
      await readOwnedCopyrightIntake(reply.intakeId),
      {
        status: 'succeeded',
        fromEmail: 'attacker@example.test',
        subject: 'Changed replay headers',
        bodyText: 'The immutable first parse still owns this reply.',
        messageId: `<${spoofedMessageId}>`,
        replyReferences: ['<not-the-original-root@example.test>'],
        attachments: [],
      },
      promoted.noticeId,
      {
        noticeId: promoted.noticeId,
        matchedIntakeId: root.intakeId,
        matchedReference: rootMessageId,
      },
    )
    const spoofReply = await createUnparsedCopyrightEmailIntake()
    await assertOwnedCopyrightUnknownParse(
      spoofReply,
      {
        status: 'succeeded',
        fromEmail: 'attacker@example.test',
        subject: 'Re: spoofed message',
        bodyText: 'This references only the altered replay header.',
        messageId: `<${crypto.randomUUID()}@example.test>`,
        replyReferences: [`<${spoofedMessageId}>`],
        attachments: [],
      },
      promoted.noticeId,
    )
  })
})
