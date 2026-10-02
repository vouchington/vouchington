import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as imageEnqueues from '@queues/images/enqueues'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import {
  createCopyrightAppeal,
  processCopyrightActionIntent,
  reviewCopyrightAppeal,
} from './index.mts'
import { openHeldCounterNoticeRestore } from './restoration-hold-scene.mts'

describe('copyright staydown entries when a restriction is lifted', () => {
  useStaydownMatching()

  beforeEach(() => {
    vi.spyOn(imageEnqueues, 'enqueueStaydownHash').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes only the lifted restriction entry when its restore is delivered', async () => {
    const dependencies = createTestCopyrightDeliveryDependencies(async () => undefined)
    const scene = await openHeldCounterNoticeRestore(dependencies, 2)
    const before = await readCopyrightStaydownEntries(scene.notice.id)
    expect(before).toHaveLength(2)

    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, dependencies),
    ).resolves.toBe('applied')

    const after = await readCopyrightStaydownEntries(scene.notice.id)
    expect(after).toHaveLength(1)
    expect(after[0]?.image_id).not.toBe(scene.target.image_id)
    expect(after[0]?.copyright_restriction_id).not.toBe(scene.restriction.id)
  })

  it('removes the entry as soon as staff reverse the restriction on appeal', async () => {
    const staydownCase = await createRestrictedStaydownCase()
    const [target] = staydownCase.targets
    const [restriction] = staydownCase.restrictions
    expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toHaveLength(1)
    const appeal = await createCopyrightAppeal(
      staydownCase.claimant,
      staydownCase.noticeId,
      crypto.randomUUID(),
      { reason: 'I created this image.', targetIds: [target!.id] },
    )

    await reviewCopyrightAppeal({
      submissionId: appeal.submission.id,
      currentUser: staydownCase.moderator,
      recommendationId: null,
      manualFallbackReason: 'No automated recommendation was available.',
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: restriction!.id, action: 'reverse' }],
    })

    // The restore saga has not been delivered, so the restriction is still unlifted: the entry
    // went with the reversal itself, not with the later lift.
    const reviewed = await getCopyrightNoticePrivateAggregate(staydownCase.noticeId)
    expect(reviewed?.restrictions[0]).toMatchObject({ lifted_at: null })
    expect(reviewed?.actionIntents).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'restore', state: 'pending' })]),
    )
    expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toEqual([])
  })
})
