import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { getCopyrightStaffEmailIntake } from './read-models.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email review path after separate-case approval', () => {
  it('reports an approved ambiguous reply as its own initial notice', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const duplicatedMessageId = copyrightEmailMessageId()
    await recordThreadedCopyrightEmail({ messageId: duplicatedMessageId, replyReferences: [] })
    await recordThreadedCopyrightEmail({ messageId: duplicatedMessageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [duplicatedMessageId],
    })
    expect(reply.match).toBeNull()

    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, reply.intakeId),
    )
    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'initial',
      linked_notice: { id: promoted.noticeId },
    })
  })

  it('keeps an over-cap ancestor conflict unresolved and available to staff', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    await promoteInitialCopyrightEmail({ moderator, messageId: firstMessageId })
    await promoteInitialCopyrightEmail({ moderator, messageId: secondMessageId })
    const reply = await recordThreadedCopyrightEmail({
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
      await expect(
        promoteCopyrightEmailIntake(await copyrightEmailPromotionInput(moderator, reply.intakeId)),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      restoreOverflow()
    }
  })
})
