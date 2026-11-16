import { afterEach, describe, expect, it, vi } from 'vitest'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { raceCopyrightFailureWithGuestFiling } from '@voucha/test-helpers/copyright-failure-guest-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { claimCopyrightActionIntent, failCopyrightActionIntent } from './action-delivery-state.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'

describe('copyright claims racing guest court admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['pending', 'exhausted'] as const)(
    'lets admission preempt the %s work writer',
    async state => {
      installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      let now = scene.restorationAt
      if (state === 'exhausted') {
        for (let attempt = 0; attempt < 5; attempt++) {
          now = new Date(scene.restorationAt.getTime() + attempt * 60 * 60_000)
          const claimed = await claimCopyrightActionIntent(scene.restore.id, now)
          if (!claimed) throw new Error('Fixture restore could not be claimed')
          if (attempt < 4)
            await failCopyrightActionIntent({
              intentId: claimed.id,
              leaseToken: claimed.lease_token,
              failedAt: now,
              failureMessage: 'Provider failed before the exhausted claim race.',
            })
        }
        now = new Date(now.getTime() + 6 * 60_000)
      }
      const capability = await issueCopyrightGuestCapability({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        issuedAt: scene.restorationAt,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      })
      const outcomes = await raceCopyrightFailureWithGuestFiling({
        noticeId: scene.notice.id,
        failure: () => claimCopyrightActionIntent(scene.restore.id, now),
        filing: () =>
          appendCopyrightGuestFiling({
            noticeId: scene.notice.id,
            token: capability.token,
            now,
            kind: 'court_or_ccb_hold',
            statement: 'A federal court proceeding has commenced.',
          }),
      })
      expect(outcomes[0]).toEqual({ status: 'fulfilled', value: null })
      expect(outcomes[1].status).toBe('fulfilled')
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
        state: 'blocked',
        attempt_count: state === 'pending' ? 0 : 5,
      })
      expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
      expect(
        after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
      ).toHaveLength(1)
    },
  )
  it('persists terminal failure when the fifth claimed attempt expires without a receipt', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    let now = scene.restorationAt
    for (let attempt = 0; attempt < 5; attempt++) {
      now = new Date(scene.restorationAt.getTime() + attempt * 60 * 60_000)
      const claimed = await claimCopyrightActionIntent(scene.restore.id, now)
      if (!claimed) throw new Error('Restore claim missing')
      if (attempt < 4)
        await failCopyrightActionIntent({
          intentId: claimed.id,
          leaseToken: claimed.lease_token,
          failedAt: now,
          failureMessage: 'Provider attempt failed.',
        })
    }
    await expect(
      claimCopyrightActionIntent(scene.restore.id, new Date(now.getTime() + 6 * 60_000)),
    ).resolves.toBeNull()
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'failed',
      attempt_count: 5,
      completed_at_reason: 'failed',
      failure_message: 'A claimed copyright action exceeded the maximum delivery attempts.',
    })
    expect(after?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toBeNull()
  })
})
