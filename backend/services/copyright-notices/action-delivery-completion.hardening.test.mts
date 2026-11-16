import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { raceCopyrightFailureWithGuestFiling } from '@voucha/test-helpers/copyright-failure-guest-race'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'

describe('failure release racing guest court admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each([1, 5])('settles the actual failure write at attempt %s', async attempt => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    let claimed: Awaited<ReturnType<typeof claimCopyrightActionIntent>> = null
    let now = scene.restorationAt
    for (let index = 0; index < attempt; index++) {
      now = new Date(scene.restorationAt.getTime() + index * 60 * 60_000)
      claimed = await claimCopyrightActionIntent(scene.restore.id, now)
      if (!claimed) throw new Error('Restore could not be claimed')
      if (index + 1 < attempt)
        await failCopyrightActionIntent({
          intentId: claimed.id,
          leaseToken: claimed.lease_token,
          failedAt: now,
          failureMessage: 'Fixture provider failure before the contested attempt.',
        })
    }
    if (!claimed) throw new Error('Restore claim disappeared')
    const owned = claimed
    const capability = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: scene.restorationAt,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    })
    const outcomes = await raceCopyrightFailureWithGuestFiling({
      noticeId: scene.notice.id,
      failure: () =>
        failCopyrightActionIntent({
          intentId: owned.id,
          leaseToken: owned.lease_token,
          failedAt: now,
          failureMessage: 'Actual provider failure racing court admission.',
        }),
      filing: () =>
        appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token: capability.token,
          now,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court proceeding has commenced.',
        }),
    })
    expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'blocked',
    })
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
  })
})
