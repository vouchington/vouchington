import { seedCopyrightPromotionThreadEmail } from '@voucha/test-helpers/copyright-promotion-thread-fixtures'
import {
  ownedCopyrightEmailPromotionInput,
  seedCommittedCopyrightPromotion,
} from '@voucha/test-helpers/copyright-promotion-committed-fixtures'
import {
  assertCopyrightPromotionOutcome,
  assertCopyrightPromotionGuard,
} from '@voucha/test-helpers/copyright-email-promotion-outcomes'
import { createCommittedCopyrightEmailCase } from '@voucha/test-helpers/copyright-committed-email-case'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { copyrightConfig } from './config.mts'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email review path after separate-case approval', () => {
  it('reports an approved ambiguous reply as its own initial notice', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const attempted = await ambiguousScene(moderator)
    expect(attempted.reply.match).toBeNull()
    await assertCopyrightPromotionOutcome({
      input: attempted.input,
      intakeIds: attempted.intakeIds,
    })
    // Classification always runs against its own complete committed approval, even if the actor aborted.
    const committed = await ambiguousScene(moderator)
    const promoted = await seedCommittedCopyrightPromotion(committed.input)
    await expect(
      getCopyrightStaffEmailIntake(committed.reply.intakeId, moderator),
    ).resolves.toMatchObject({
      review_path: 'initial',
      linked_notice: { id: promoted.noticeId },
    })
  })

  it('keeps an over-cap ancestor conflict unresolved and available to staff', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const first = await createCommittedCopyrightEmailCase({ moderator, messageId: firstMessageId })
    const second = await createCommittedCopyrightEmailCase({
      moderator,
      messageId: secondMessageId,
    })
    const reply = await seedCopyrightPromotionThreadEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [firstMessageId, secondMessageId],
    })
    const restoreExact = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 5,
    })
    try {
      await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
        review_path: 'ancestor_notice_conflict',
      })
    } finally {
      restoreExact()
    }

    const restoreOverflow = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 3,
    })
    try {
      const queue = await searchCopyrightStaffEmailIntakes(moderator, {
        limit: 1,
        intakeIds: [reply.intakeId],
      })
      expect(queue.intakes[0]).toMatchObject({
        review_path: 'unresolved_thread',
        linked_notice_id: null,
      })
      await assertCopyrightPromotionGuard(
        {
          input: await ownedCopyrightEmailPromotionInput(moderator, reply.intakeId),
          intakeIds: [reply.intakeId],
          parentNoticeIds: [first.noticeId, second.noticeId],
        },
        'Unresolved reply email must wait for its root case',
      )
    } finally {
      restoreOverflow()
    }
  })
})

async function ambiguousScene(moderator: Awaited<ReturnType<typeof createTestUser>>) {
  const duplicatedMessageId = copyrightEmailMessageId()
  const first = await seedCopyrightPromotionThreadEmail({
    messageId: duplicatedMessageId,
    replyReferences: [],
  })
  const second = await seedCopyrightPromotionThreadEmail({
    messageId: duplicatedMessageId,
    replyReferences: [],
  })
  const reply = await seedCopyrightPromotionThreadEmail({
    messageId: copyrightEmailMessageId(),
    replyReferences: [duplicatedMessageId],
  })
  return {
    reply,
    input: await ownedCopyrightEmailPromotionInput(moderator, reply.intakeId),
    intakeIds: [first.intakeId, second.intakeId, reply.intakeId],
  }
}
