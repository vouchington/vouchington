import { assertSurfaceRestoreOutcome } from '@voucha/test-helpers/copyright-surface-restore-outcome'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright notice overlapping legal holds', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('replays a blocked restore after the final overlapping hold resolves', async () => {
    installTestMediaDeliveryEdge()
    const { initialWithhold, moderator, notice, restorationAt, restore, restriction, target } =
      await openHeldCounterNoticeRestore()
    const initialRestore = restore
    await expect(processCopyrightActionIntent(initialRestore.id, restorationAt)).resolves.toBe(
      'applied',
    )

    const initialNotices = await readTestCopyrightStatementIntents(notice.id)
    expect(
      initialNotices.filter(
        row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
      ),
    ).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Restoration is authorized.') }),
    ])

    const firstHold = await createQualifyingHold({
      moderator,
      noticeId: notice.id,
      targetId: target.id,
      assessedAt: new Date(restorationAt.getTime() + 60_000),
    })
    const holdWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'withhold' && intent.id !== initialWithhold.id,
    )
    if (!holdWithhold) throw new Error('hold withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(holdWithhold.id, new Date(restorationAt.getTime() + 120_000)),
    ).resolves.toBe('applied')

    const secondHold = await createQualifyingHold({
      moderator,
      noticeId: notice.id,
      targetId: target.id,
      assessedAt: new Date(restorationAt.getTime() + 150_000),
    })
    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: firstHold.id,
      resolvedAt: new Date(restorationAt.getTime() + 180_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const holdRestore = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'restore' && intent.copyright_restriction_id !== restriction.id,
    )
    if (!holdRestore) throw new Error('hold restore intent disappeared')
    await expect(
      processCopyrightActionIntent(holdRestore.id, new Date(restorationAt.getTime() + 240_000)),
    ).resolves.toBe('blocked')
    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )

    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: secondHold.id,
      resolvedAt: new Date(restorationAt.getTime() + 300_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const resolved = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(resolved?.holdResolutions).toEqual(
      expect.arrayContaining(
        [firstHold, secondHold].map(hold =>
          expect.objectContaining({
            copyright_notice_legal_hold_assessment_id: hold.id,
            resolved_by_id: moderator.id,
            resolution_kind: 'dismissed',
          }),
        ),
      ),
    )
    const posterId = initialNotices.find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )?.recipient_user_id
    if (!posterId) throw new Error('Committed restoration recipient disappeared')
    await assertSurfaceRestoreOutcome({
      noticeId: notice.id,
      restrictionId: holdRestore.copyright_restriction_id,
      placementId: target.placement_id,
      restoreId: holdRestore.id,
      now: new Date(restorationAt.getTime() + 360_000),
      outcome: 'visible',
      deliveries: [
        `poster_restoration_notice:email:${posterId}`,
        `poster_restoration_notice:in_app:${posterId}`,
      ],
    })
  })
})

async function createQualifyingHold(input: {
  moderator: Parameters<typeof appendCopyrightLegalHoldAssessment>[0]['currentUser']
  noticeId: string
  targetId: string
  assessedAt: Date
}) {
  const receivedAt = new Date('2026-07-03T12:00:00.000Z')
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId: input.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
  return appendCopyrightLegalHoldAssessment({
    currentUser: input.moderator,
    submissionId: submission.id,
    assessedAt: input.assessedAt,
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date('2026-07-03T11:00:00.000Z'),
    receivedByDesignatedAgentAt: receivedAt,
    sameMaterial: true,
    targetIds: [input.targetId],
    rationale: 'Verified qualifying federal court filing.',
  })
}
