import {
  readTestCopyrightFilingHoldBindings,
  readTestStaffFilingRestrictions,
} from '@voucha/test-helpers/copyright-filing-source-constraints'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { createCopyrightCourtFilingScene } from '@voucha/test-helpers/copyright-court-filing-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { resolveCopyrightLegalHold } from './hold-resolution.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

describe('filing-origin restriction lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('withholds without a fabricated notice assessment and restores through the real worker after nonqualification', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const filing = await scene.file()
    const filed = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(filed?.assessments).toEqual([])
    expect(filed?.deliveryIntents).toContainEqual(
      expect.objectContaining({
        delivery_kind: 'poster_restriction_notice',
        recipient_user_id: scene.surface.actorUserId,
      }),
    )
    expect(await readTestStaffFilingRestrictions(scene.notice.id)).toContainEqual(
      expect.objectContaining({ copyright_notice_submission_id: filing.id }),
    )
    expect(filed?.restrictions).toContainEqual(
      expect.objectContaining({
        authorizing_assessment_id: null,
        copyright_notice_submission_id: filing.id,
        lifted_at: null,
        is_authorizing_assessment_automated: false,
      }),
    )
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(true)
    await scene.assess(filing.id, false)
    const assessed = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const restore = assessed?.actionIntents.find(
      row => row.action === 'restore' && row.state === 'pending',
    )
    if (!restore) throw new Error('Nonqualifying filing did not create restoration work')
    await expect(processCopyrightActionIntent(restore.id, new Date())).resolves.toBe('applied')
    const tuple = await getImagePlacementForCopyright(scene.surface.placementId)
    if (!tuple) throw new Error('Restored tuple disappeared')
    expect(tuple.withheld).toBe(false)
    const oldWithhold = filed?.actionIntents.find(row => row.action === 'withhold')
    if (!oldWithhold) throw new Error('Filing did not retain its withholding work')
    await expect(processCopyrightActionIntent(oldWithhold.id, new Date())).resolves.toBe('stale')
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(false)
    expect(
      await readMediaDeliveryRegistryItem(
        getImagePlacementDeliveryKey({
          placementId: tuple.placementId,
          revision: tuple.revision,
          imageId: tuple.imageId,
        }),
      ),
    ).toMatchObject({ state: 'allow' })
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.deliveryIntents,
    ).toContainEqual(
      expect.objectContaining({
        delivery_kind: 'poster_restoration_notice',
        recipient_user_id: scene.surface.actorUserId,
      }),
    )
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.restrictions[0]?.lifted_at,
    ).toBeInstanceOf(Date)
  })
  it.each([false, true])(
    'keeps B authoritative after A nonqualifies, then restores when B ends (qualifies: %s)',
    async qualifies => {
      for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
        vi.stubEnv(key, value)
      const scene = await createCopyrightCourtFilingScene()
      const first = await scene.file()
      const second = await scene.file()
      await scene.assess(first.id, false)
      const during = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(during?.restrictions.filter(row => row.lifted_at === null)).toHaveLength(1)
      expect(during?.restrictions[0]?.copyright_notice_submission_id).toBe(first.id)
      const blocked = during?.actionIntents.find(row => row.action === 'restore')
      if (!blocked) throw new Error('Filing restoration work was not retained')
      await expect(processCopyrightActionIntent(blocked.id, new Date())).resolves.toBe('blocked')
      expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(true)
      const assessment = await scene.assess(second.id, qualifies)
      const bindings = await readTestCopyrightFilingHoldBindings(during!.restrictions[0]!.id)
      expect(bindings).toEqual(qualifies ? [assessment.id] : [])
      if (qualifies)
        await resolveCopyrightLegalHold({
          currentUser: scene.moderator,
          assessmentId: assessment.id,
          resolvedAt: new Date(),
          resolutionKind: 'dismissed',
          rationale: 'The proceeding ended without a continuing restriction.',
        })
      const ready = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      const restore = ready?.actionIntents.find(
        row => row.action === 'restore' && row.state === 'pending',
      )
      if (!restore) throw new Error('Final filing decision did not authorize restoration')
      await expect(processCopyrightActionIntent(restore.id, new Date())).resolves.toBe('applied')
      const tuple = await getImagePlacementForCopyright(scene.surface.placementId)
      if (!tuple) throw new Error('Restored tuple disappeared')
      expect(tuple.withheld).toBe(false)
      expect(
        await readMediaDeliveryRegistryItem(
          getImagePlacementDeliveryKey({
            placementId: tuple.placementId,
            revision: tuple.revision,
            imageId: tuple.imageId,
          }),
        ),
      ).toMatchObject({ state: 'allow' })
    },
  )
  it('preserves a later compliant notice ground when the filing does not qualify', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const filing = await scene.file()
    const original = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const initial = original?.submissions.find(row => row.kind === 'notice')
    if (!initial) throw new Error('Notice submission disappeared')
    const assessment = await appendCopyrightSubmissionAssessment({
      currentUser: scene.moderator,
      submissionId: initial.id,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: scene.notice.id,
      targetId: scene.target.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    await scene.assess(filing.id, false)
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.restrictions.find(row => row.id === restriction.id)).toMatchObject({
      lifted_at: null,
      authorizing_assessment_id: assessment.id,
      copyright_notice_submission_id: null,
    })
    expect(
      after?.restrictions.find(row => row.copyright_notice_submission_id === filing.id)?.lifted_at,
    ).toBeInstanceOf(Date)
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(true)
  })
})
