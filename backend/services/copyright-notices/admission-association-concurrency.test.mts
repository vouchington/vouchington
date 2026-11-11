import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightNoticeForManualAssociation,
  readCopyrightEmailManualAssociationEvent,
} from '@voucha/test-helpers/copyright-email-manual-association'
import {
  copyrightEmailMessageId,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  admitAndAssociateCopyrightEmail,
  failRestorationAndAdmitCopyrightEmail,
  rejectCopyrightAdmissionWithoutSource,
} from '@voucha/test-helpers/copyright-admission-association-race'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'

describe('copyright correspondence and another intake association', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['admission', 'association'] as const)(
    'commits both effects when %s reaches its write first',
    async first => {
      const currentUser = await createTestUser({ extraRoles: ['moderator'] })
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const admitted = await recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [copyrightEmailMessageId()],
      })
      const associated = await recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [copyrightEmailMessageId()],
      })
      await linkCopyrightEmailIntakeToNotice({
        noticeId,
        intakeId: admitted.intakeId,
        linkKind: 'thread',
      })
      const result = await admitAndAssociateCopyrightEmail(
        {
          currentUser,
          intakeId: admitted.intakeId,
          kind: 'supplement',
          targetIds: [],
          structuredSubmission: { summary: 'Additional evidence.' },
          rationale: 'Verified supplemental evidence.',
          recommendationId: null,
          manualFallbackReason: 'Agent unavailable.',
        },
        noticeId,
        associated.intakeId,
        first,
      )
      expect(result.admission).toMatchObject({ noticeId, isDuplicate: false })
      expect(await readCopyrightEmailIntakeNoticeLinks(associated.intakeId)).toEqual([
        { copyright_notice_id: noticeId, link_kind: 'thread' },
      ])
      expect(await readCopyrightEmailManualAssociationEvent(associated.intakeId)).toHaveLength(1)
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(aggregate?.emailCorrespondenceReviews).toHaveLength(1)
      expect(aggregate?.submissions.filter(row => row.kind === 'supplement')).toHaveLength(1)
      expect(
        aggregate?.lifecycleEvents.filter(
          row => row.change_type === 'email_correspondence_admitted',
        ),
      ).toHaveLength(1)
    },
  )
  it('preempts an active restoration and commits association when court admission writes first', async () => {
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const admitted = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    const associated = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: admitted.intakeId,
      linkKind: 'thread',
    })
    const result = await admitAndAssociateCopyrightEmail(
      {
        currentUser: moderator,
        intakeId: admitted.intakeId,
        kind: 'court_or_ccb_hold',
        targetIds: [],
        structuredSubmission: { summary: 'Verified court filing.' },
        rationale: 'Court filing received.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      },
      notice.id,
      associated.intakeId,
      'admission',
    )
    expect(result.admission).toMatchObject({ noticeId: notice.id, isDuplicate: false })
    expect(await readCopyrightEmailIntakeNoticeLinks(associated.intakeId)).toEqual([
      { copyright_notice_id: notice.id, link_kind: 'thread' },
    ])
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.actionIntents.find(row => row.id === restore.id)?.state).toBe('blocked')
    expect(
      aggregate?.lifecycleEvents.filter(row => row.change_type === 'email_correspondence_admitted'),
    ).toHaveLength(1)
  })

  it('retains a filing and denies restoration after an owned worker failure commits first', async () => {
    const { notice, moderator, restore, restorationAt } = await openHeldCounterNoticeRestore()
    const claimed = await claimCopyrightActionIntent(restore.id, restorationAt)
    expect(claimed).not.toBeNull()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: reply.intakeId,
      linkKind: 'thread',
    })
    const result = await failRestorationAndAdmitCopyrightEmail(
      {
        currentUser: moderator,
        intakeId: reply.intakeId,
        kind: 'court_or_ccb_hold',
        targetIds: [],
        structuredSubmission: { summary: 'Court filing.' },
        rationale: 'Verified filing.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      },
      notice.id,
      {
        intentId: restore.id,
        leaseToken: claimed!.lease_token,
        failedAt: new Date(),
        failureMessage: 'Owned provider failure.',
      },
    )
    expect(result.outcome).toBe('retrying')
    expect(result.admission).toMatchObject({ noticeId: notice.id, isDuplicate: false })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.actionIntents.find(row => row.id === restore.id)?.state).toBe('blocked')
    expect(aggregate?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
  })

  it('rolls back preemption, the earlier event and its clock when later target validation fails', async () => {
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: reply.intakeId,
      linkKind: 'thread',
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    const clock = await readCopyrightCaseLifecycleClock(notice.id)
    await expect(
      admitCopyrightEmailCorrespondence({
        currentUser: moderator,
        intakeId: reply.intakeId,
        kind: 'court_or_ccb_hold',
        targetIds: [crypto.randomUUID()],
        structuredSubmission: { summary: 'Court filing.' },
        rationale: 'Verified filing.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      }),
    ).rejects.toMatchObject({ status: 422 })
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.actionIntents.find(row => row.id === restore.id)?.state).toBe('pending')
    expect(after?.submissions).toEqual(before?.submissions)
    expect(after?.emailCorrespondenceReviews).toEqual(before?.emailCorrespondenceReviews)
    expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
    expect(await readCopyrightCaseLifecycleClock(notice.id)).toEqual(clock)
  })

  it.each(['correspondence', 'submission', 'assessment'] as const)(
    'rejects a missing deferred %s source and rolls back its event and clock',
    async source => {
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      const clock = await readCopyrightCaseLifecycleClock(noticeId)
      await expect(rejectCopyrightAdmissionWithoutSource(noticeId, source)).rejects.toMatchObject({
        code: '23503',
        constraint: `fk_copyright_lifecycle_events__${source}_notice`,
      })
      const after = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
      expect(await readCopyrightCaseLifecycleClock(noticeId)).toEqual(clock)
    },
  )
})
