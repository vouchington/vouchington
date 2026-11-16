import { afterEach, describe, expect, it, vi } from 'vitest'
import { mediaDeliveryEdgeEnvironment } from '@voucha/test-helpers/media-delivery-emulator'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { raceCopyrightPreparationWithGuestFiling } from '@voucha/test-helpers/copyright-preparation-guest-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'

describe('restore preparation racing guest court admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('commits the filing and preempts preparation without a phantom authorization', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await openHeldCounterNoticeRestore()
    const capability = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: scene.restorationAt,
      expiresAt: new Date(scene.restorationAt.getTime() + 60 * 60_000),
    })
    const outcomes = await raceCopyrightPreparationWithGuestFiling({
      intentId: scene.restore.id,
      restrictionId: scene.restriction.id,
      noticeId: scene.notice.id,
      action: () => processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      filing: () =>
        appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token: capability.token,
          now: scene.restorationAt,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court proceeding has commenced.',
        }),
    })
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'not_claimed' })
    expect(outcomes[1].status).toBe('fulfilled')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'blocked',
    })
    expect(after?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toBeNull()
    expect(
      after?.lifecycleEvents.filter(
        row =>
          row.copyright_notice_action_intent_id === scene.restore.id &&
          row.change_type === 'restoration_authorized_pending_delivery',
      ),
    ).toEqual([])
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
    expect((await getImagePlacementForCopyright(scene.target.placement_id))?.withheld).toBe(true)
  })
})
