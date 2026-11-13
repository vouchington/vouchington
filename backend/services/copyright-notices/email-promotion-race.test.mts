import { createCommittedCopyrightEmailCase } from '@voucha/test-helpers/copyright-committed-email-case'
import { createTestUser } from '@voucha/test-helpers'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { ownedCopyrightEmailPromotionInput } from '@voucha/test-helpers/copyright-promotion-committed-fixtures'
import {
  assertCopyrightPromotionThreadRace,
  assertCopyrightSameReceiptPromotions,
} from '@voucha/test-helpers/copyright-email-promotion-race-outcomes'
import { describe, expect, it } from 'vitest'

describe('copyright email promotion and threading', () => {
  it('retains one case link and a matching review when promotion races a thread link', async () => {
    expect.hasAssertions()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await createCommittedCopyrightEmailCase({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await ownedCopyrightEmailPromotionInput(moderator, intake.id)
    await assertCopyrightPromotionThreadRace(
      { input, intakeIds: [intake.id], parentNoticeIds: [parent.noticeId] },
      parent.noticeId,
      messageId,
      'simultaneous',
    )
  })

  it('keeps the review and evidence atomic when a competing thread link waits', async () => {
    expect.hasAssertions()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await createCommittedCopyrightEmailCase({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await ownedCopyrightEmailPromotionInput(moderator, intake.id)
    await assertCopyrightPromotionThreadRace(
      { input, intakeIds: [intake.id], parentNoticeIds: [parent.noticeId] },
      parent.noticeId,
      messageId,
      'review-before-link',
    )
  })

  it('admits one case when two promotions race on the same receipt', async () => {
    expect.hasAssertions()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await ownedCopyrightEmailPromotionInput(moderator, intake.id)
    await assertCopyrightSameReceiptPromotions({ input, intakeIds: [intake.id] })
  })
})
