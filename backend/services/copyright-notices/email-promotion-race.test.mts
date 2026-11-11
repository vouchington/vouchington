import { createTestUser } from '@voucha/test-helpers'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import {
  readCopyrightEmailIntakeNoticeLinks,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email promotion and threading', () => {
  it('retains one case link and a matching review when promotion races a thread link', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)

    const [promotion, threadLink] = await Promise.allSettled([
      promoteCopyrightEmailIntake(input),
      linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: parent.noticeId,
        linkKind: 'thread',
        matchedReference: messageId,
      }),
    ])
    const links = await readCopyrightEmailIntakeNoticeLinks(intake.id)
    const reviews = await readCopyrightEmailIntakeReview(intake.id)
    const wasPromoted = promotion.status === 'fulfilled'
    const expectedNoticeId = wasPromoted ? promotion.value.noticeId : parent.noticeId
    const effects = await readCopyrightEmailPromotionEffects(
      intake.id,
      input.targets[0]!.placementId,
    )
    expect(threadLink).toEqual({ status: 'fulfilled', value: !wasPromoted })
    const rejectionStatus =
      promotion.status === 'rejected'
        ? (promotion.reason as { status?: number } | null)?.status
        : null
    expect(rejectionStatus).toBe(wasPromoted ? null : 409)
    expect(links).toEqual([
      { copyright_notice_id: expectedNoticeId, link_kind: wasPromoted ? 'initial' : 'thread' },
    ])
    expect(reviews).toEqual(
      wasPromoted ? [{ decision: 'approved', promoted_copyright_notice_id: expectedNoticeId }] : [],
    )
    expect(effects).toMatchObject({
      reviews: Number(wasPromoted),
      evidence: Number(wasPromoted),
      notice_targets: Number(wasPromoted),
    })
  })
})
