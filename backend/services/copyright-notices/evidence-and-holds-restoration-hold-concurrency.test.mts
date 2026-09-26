import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  processCopyrightActionIntent,
} from './index.mts'
import { openHeldCounterNoticeRestore } from './restoration-hold-scene.mts'

describe('late legal-hold and restoration concurrency', () => {
  it('serializes the placement fence before case records, leaving a concurrent restored tuple denied', async () => {
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    const { moderator, notice, restorationAt, restore, target } =
      await openHeldCounterNoticeRestore(publish)
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(restorationAt.getTime() - 1),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `concurrent-hold-${crypto.randomUUID()}`,
    })

    const [restoreOutcome, holdOutcome] = await Promise.all([
      processCopyrightActionIntent(restore.id, restorationAt, {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
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
        dependencies: {
          assertLegalEnforcementEnabled: () => {},
          publishPlacement: publish,
        },
      }),
    ])

    expect(['applied', 'blocked', 'stale']).toContain(restoreOutcome)
    expect(holdOutcome.target_ids).toEqual([target.id])
    await expect(getImagePlacementForCopyright(target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})
