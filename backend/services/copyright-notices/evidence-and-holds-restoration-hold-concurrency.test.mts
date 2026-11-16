import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { appendCopyrightLegalHoldAssessment, processCopyrightActionIntent } from './index.mts'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'

describe('late legal-hold and restoration concurrency', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the tuple denied when hold qualification overlaps restoration', async () => {
    const { moderator, notice, restorationAt, restore, target } =
      await openHeldCounterNoticeRestore()
    const holdSubmission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(restorationAt.getTime() - 1),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `concurrent-hold-${crypto.randomUUID()}`,
    })

    const [restoreOutcome, holdOutcome] = await Promise.allSettled([
      processCopyrightActionIntent(restore.id, restorationAt),
      appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId: holdSubmission.id,
        assessedAt: new Date(restorationAt.getTime() + 60_000),
        fromOriginalClaimant: true,
        proceedingKind: 'federal_court',
        ccbClaimKind: null,
        commencedAt: new Date(restorationAt.getTime() - 60_000),
        receivedByDesignatedAgentAt: new Date(restorationAt.getTime() - 1),
        sameMaterial: true,
        targetIds: [target.id],
        rationale: 'Verified qualifying filing during restoration.',
      }),
    ])

    const restoreResult =
      restoreOutcome.status === 'fulfilled'
        ? restoreOutcome
        : {
            status: 'rejected',
            statusCode: restoreOutcome.reason?.status,
            causeCode: restoreOutcome.reason?.cause?.code,
          }
    expect([
      ...['applied', 'blocked', 'stale', 'not_claimed'].map(value => ({
        status: 'fulfilled',
        value,
      })),
      { status: 'rejected', statusCode: 409, causeCode: '40001' },
    ]).toContainEqual(restoreResult)
    expect(holdOutcome).toMatchObject({ status: 'fulfilled', value: { target_ids: [target.id] } })
    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})
