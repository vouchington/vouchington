import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import {
  copyrightEmailMessageId,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-rejection.mts'

describe('concurrent copyright correspondence decisions', () => {
  it('commits one final decision when admission and rejection compete', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const { intakeId } = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    await linkCopyrightEmailIntakeToNotice({ intakeId, noticeId, linkKind: 'thread' })
    const review = {
      currentUser: moderator,
      intakeId,
      kind: 'supplement' as const,
      targetIds: [],
      rationale: 'Reviewed the supplemental evidence.',
      recommendationId: null,
      manualFallbackReason: 'Agent output unavailable.',
    }
    const outcomes = await Promise.allSettled([
      admitCopyrightEmailCorrespondence({
        ...review,
        structuredSubmission: { summary: 'Supplemental evidence.' },
      }),
      rejectCopyrightEmailCorrespondence(review),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const conflict = outcomes.find(result => result.status === 'rejected')
    expect(conflict?.status === 'rejected' ? conflict.reason : null).toMatchObject({ status: 409 })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.emailCorrespondenceReviews).toHaveLength(1)
    const admitted = outcomes[0]!.status === 'fulfilled'
    expect(aggregate?.emailCorrespondenceReviews[0]?.action).toBe(
      admitted ? 'admitted' : 'rejected',
    )
    expect(aggregate?.submissions.filter(row => row.kind === 'supplement')).toHaveLength(
      admitted ? 1 : 0,
    )
    expect(aggregate?.correspondence).toHaveLength(admitted ? 1 : 0)
  })
})
