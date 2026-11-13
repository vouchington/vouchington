import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createEffectiveStaydownNotice } from '@voucha/test-helpers/copyright-effective-review-fixtures'
import { seedEffectiveConfirmation } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { assertEffectiveAppeal } from '@voucha/test-helpers/copyright-effective-review-subjects'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { processCopyrightActionIntent } from './index.mts'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'

describe('copyright staydown entries when a restriction is lifted', () => {
  useStaydownMatching()

  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('removes only the lifted restriction entry when its restore is delivered', async () => {
    const scene = await openHeldCounterNoticeRestore(2)
    const before = await readCopyrightStaydownEntries(scene.notice.id)
    expect(before).toHaveLength(2)

    await expect(processCopyrightActionIntent(scene.restore.id, scene.restorationAt)).resolves.toBe(
      'applied',
    )

    const after = await readCopyrightStaydownEntries(scene.notice.id)
    expect(after).toHaveLength(1)
    expect(after[0]?.image_id).not.toBe(scene.target.image_id)
    expect(after[0]?.copyright_restriction_id).not.toBe(scene.restriction.id)
  })

  it('removes the entry as soon as staff reverse the restriction on appeal', async () => {
    const staydownCase = await createEffectiveStaydownNotice()
    const restriction = staydownCase.restrictions[0]!
    await seedEffectiveConfirmation(staydownCase.noticeId, restriction.id, staydownCase.moderator)
    expect(await readCopyrightStaydownEntries(staydownCase.noticeId)).toHaveLength(1)
    // The coupled state matrix requires immediate staydown removal and a still-unlifted
    // restriction with a pending restore; no delivery saga runs during this staff decision.
    await assertEffectiveAppeal(
      staydownCase,
      staydownCase.claimant,
      staydownCase.moderator,
      'reverse',
      { [staydownCase.claimant.id]: false },
    )
  })
})
