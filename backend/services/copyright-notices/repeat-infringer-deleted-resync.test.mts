import { describe, expect, it } from 'vitest'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createCopyrightAppeal, reviewCopyrightAppeal } from './index.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'

describe('deleted-account repeat-infringer resynchronization', () => {
  it.each([
    ['confirm', true],
    ['reverse', false],
  ] as const)(
    'keeps the retained incident until a real reversal: %s',
    async (action, expectedOperative) => {
      const [poster, moderator] = await Promise.all([
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
      ])
      const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      const restriction = aggregate?.restrictions[0]
      const target = aggregate?.targets[0]
      if (!restriction || !target) throw new Error('repeat-infringer fixture disappeared')
      const appeal = await createCopyrightAppeal(poster, noticeId, crypto.randomUUID(), {
        reason: 'Please review the retained restriction.',
        targetIds: [target.id],
      })
      await softDeleteUser(poster.id)

      await reviewCopyrightAppeal({
        submissionId: appeal.submission.id,
        currentUser: moderator,
        recommendationId: null,
        manualFallbackReason: 'The retained record supports a manual review.',
        rationale: 'The retained evidence was reviewed.',
        decisions: [{ restrictionId: restriction.id, action }],
      })

      expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
        expect.objectContaining({ copyright_notice_id: noticeId, is_operative: expectedOperative }),
      ])
    },
  )
})
