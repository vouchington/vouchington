import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { createQueuedReversalScene } from '@voucha/test-helpers/copyright-queued-reversal-scenes'
import {
  assertQueuedReversalRestore,
  assertQueuedReversalWithhold,
} from '@voucha/test-helpers/copyright-queued-reversal-subjects'
import { seedCompletedQueuedReversal } from '@voucha/test-helpers/copyright-queued-reversal-completion'

describe('copyright restriction reversal concurrency', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('cancels a queued withhold after reversal restores the placement', async () => {
    const actual = await createQueuedReversalScene()
    await assertQueuedReversalRestore(actual)
    // Its separate committed restore always reaches the stale-withhold and statement consumers.
    const committed = await createQueuedReversalScene()
    await seedCompletedQueuedReversal(committed.restore.id)
    await assertQueuedReversalWithhold(committed)
    const statements = await readTestCopyrightStatementIntents(committed.noticeId)
    expect(statements.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
    expect(
      statements.filter(row => row.delivery_kind === 'poster_restoration_notice'),
    ).toHaveLength(2)
    expect(
      statements.find(
        row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
      )?.text,
    ).toContain('human review reversed the decision')
    await expect(getImagePlacementForCopyright(committed.placementId)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
  })
})
