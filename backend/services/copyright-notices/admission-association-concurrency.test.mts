import { seedCommittedCopyrightCourtAdmission } from '@voucha/test-helpers/copyright-committed-court-admission'
import { expectedCopyrightAdmissionState } from '@voucha/test-helpers/copyright-admission-association-expected'
import { copyrightRaceResult } from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import {
  createCopyrightAdmissionReply,
  claimCopyrightAdmissionRestoreFixture,
  readCopyrightAdmissionAssociationState,
} from '@voucha/test-helpers/copyright-admission-association-state'
import {
  assertCopyrightAdmissionAssociationRace,
  assertCopyrightFailureAdmissionRace,
} from '@voucha/test-helpers/copyright-admission-association-outcomes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'

import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  admitAndAssociateCopyrightEmail,
  failRestorationAndAdmitCopyrightEmail,
  rejectCopyrightAdmissionWithoutSource,
} from '@voucha/test-helpers/copyright-admission-association-race'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'

describe('copyright correspondence and another intake association', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['admission', 'association'] as const)(
    'keeps complete legal stages when %s starts the overlapping writers',
    async first => {
      expect.hasAssertions()
      const currentUser = await createTestUser({ extraRoles: ['moderator'] })
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const admitted = await createCopyrightAdmissionReply()
      const associated = await createCopyrightAdmissionReply()
      await linkCopyrightEmailIntakeToNotice({
        noticeId,
        intakeId: admitted.intakeId,
        linkKind: 'thread',
      })
      const admission = {
        currentUser,
        intakeId: admitted.intakeId,
        kind: 'supplement',
        targetIds: [],
        structuredSubmission: { summary: 'Additional evidence.' },
        rationale: 'Verified supplemental evidence.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      } satisfies Parameters<typeof admitCopyrightEmailCorrespondence>[0]
      const before = await readCopyrightAdmissionAssociationState(
        noticeId,
        admitted.intakeId,
        associated.intakeId,
      )
      const result = await admitAndAssociateCopyrightEmail(
        admission,
        noticeId,
        associated.intakeId,
        first,
      )
      await assertCopyrightAdmissionAssociationRace({
        admission,
        associatedId: associated.intakeId,
        before,
        result,
      })
    },
  )
  it('couples court preemption and association to their complete overlapping outcomes', async () => {
    expect.hasAssertions()
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const admitted = await createCopyrightAdmissionReply()
    const associated = await createCopyrightAdmissionReply()
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: admitted.intakeId,
      linkKind: 'thread',
    })
    const admission = {
      currentUser: moderator,
      intakeId: admitted.intakeId,
      kind: 'court_or_ccb_hold',
      targetIds: [],
      structuredSubmission: { summary: 'Verified court filing.' },
      rationale: 'Court filing received.',
      recommendationId: null,
      manualFallbackReason: 'Agent unavailable.',
    } satisfies Parameters<typeof admitCopyrightEmailCorrespondence>[0]
    const before = await readCopyrightAdmissionAssociationState(
      notice.id,
      admitted.intakeId,
      associated.intakeId,
    )
    expect(before.aggregate.actionIntents.find(row => row.id === restore.id)?.state).toBe('pending')
    const result = await admitAndAssociateCopyrightEmail(
      admission,
      notice.id,
      associated.intakeId,
      'admission',
    )
    await assertCopyrightAdmissionAssociationRace({
      admission,
      associatedId: associated.intakeId,
      before,
      result,
    })
  })
  it('retains only the complete worker failure or court filing stage', async () => {
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const claimed = await claimCopyrightAdmissionRestoreFixture(restore.id)
    const reply = await createCopyrightAdmissionReply()
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: reply.intakeId,
      linkKind: 'thread',
    })
    const admission = {
      currentUser: moderator,
      intakeId: reply.intakeId,
      kind: 'court_or_ccb_hold',
      targetIds: [],
      structuredSubmission: { summary: 'Court filing.' },
      rationale: 'Verified filing.',
      recommendationId: null,
      manualFallbackReason: 'Agent unavailable.',
    } satisfies Parameters<typeof admitCopyrightEmailCorrespondence>[0]
    const failure = {
      intentId: restore.id,
      leaseToken: claimed.lease_token,
      failedAt: new Date(),
      failureMessage: 'Owned provider failure.',
    }
    const before = await readCopyrightAdmissionAssociationState(notice.id, reply.intakeId)
    expect(before.aggregate.actionIntents.find(row => row.id === restore.id)?.state).toBe('claimed')
    const result = await failRestorationAndAdmitCopyrightEmail(admission, notice.id, failure)
    await assertCopyrightFailureAdmissionRace({
      admission,
      restoreId: restore.id,
      failure,
      before,
      result,
    })
  })

  it('keeps a separately committed court preemption intact on nonwriting admission replay', async () => {
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const reply = await createCopyrightAdmissionReply()
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: reply.intakeId,
      linkKind: 'thread',
    })
    const input = {
      currentUser: moderator,
      intakeId: reply.intakeId,
      kind: 'court_or_ccb_hold',
      targetIds: [],
      structuredSubmission: { summary: 'Committed court filing.' },
      rationale: 'Verified court filing.',
      recommendationId: null,
      manualFallbackReason: 'Agent unavailable.',
    } satisfies Parameters<typeof admitCopyrightEmailCorrespondence>[0]
    const before = await readCopyrightAdmissionAssociationState(notice.id, reply.intakeId)
    expect(before.aggregate.actionIntents.find(row => row.id === restore.id)?.state).toBe('pending')
    const committed = await seedCommittedCopyrightCourtAdmission(input)
    const after = await readCopyrightAdmissionAssociationState(notice.id, reply.intakeId)
    expect(after).toEqual(expectedCopyrightAdmissionState(before, after, input))
    await expect(admitCopyrightEmailCorrespondence(input)).resolves.toEqual({
      ...committed,
      isDuplicate: true,
    })
    expect(await readCopyrightAdmissionAssociationState(notice.id, reply.intakeId)).toEqual(after)
  })

  it('rolls back preemption, the earlier event and its clock when later target validation fails', async () => {
    const { notice, moderator, restore } = await openHeldCounterNoticeRestore()
    const reply = await createCopyrightAdmissionReply()
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.id,
      intakeId: reply.intakeId,
      linkKind: 'thread',
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    const clock = await readCopyrightCaseLifecycleClock(notice.id)
    const [attempt] = await Promise.allSettled([
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
    ])
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect([
      {
        result: {
          status: 'rejected',
          statusCode: 422,
          code: undefined,
          message: 'Correspondence target is not in this case',
          causeCode: undefined,
        },
        aggregate: before,
        clock,
      },
      {
        result: {
          status: 'rejected',
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Conflicting copyright case change',
          causeCode: '40001',
        },
        aggregate: before,
        clock,
      },
    ]).toContainEqual({
      result: copyrightRaceResult(attempt!),
      aggregate: after,
      clock: await readCopyrightCaseLifecycleClock(notice.id),
    })
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
