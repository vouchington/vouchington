import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  raceCopyrightCompletionWithGuestFiling,
  raceCopyrightFinalizationWithGuestFiling,
} from '@voucha/test-helpers/copyright-guest-filing-race'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
} from '@services/images/placements'
import { finalizeCopyrightActionAfterDelivery } from './action-delivery-finalization.mts'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import {
  commitTestCopyrightCourtEvent,
  readTestCopyrightBlockerGeneration,
  readTestCopyrightLeaseExpiry,
  readTestCopyrightGuestEventClocks,
  renewTestCopyrightActionLease,
} from '@voucha/test-helpers/copyright-guest-filing-constraints'
import { completeTestCopyrightActionClaim } from '@voucha/test-helpers/copyright-lease-fencing'

describe('guest copyright filing and restore completion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('commits a guest court filing racing a completion that already wrote its event', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const capability = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: scene.restorationAt,
      expiresAt: new Date(scene.restorationAt.getTime() + 24 * 60 * 60_000),
    })
    const outcomes = await raceCopyrightCompletionWithGuestFiling({
      intentId: scene.restore.id,
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
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'applied' })
    expect(outcomes[1]).toMatchObject({ status: 'fulfilled', value: { kind: 'court_or_ccb_hold' } })
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
  })

  it('retains a guest court filing admitted before the pending completion event', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const capability = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: scene.restorationAt,
      expiresAt: new Date(scene.restorationAt.getTime() + 24 * 60 * 60_000),
    })
    const restore = beforePostgresTransactionQueryForTest(
      '/* processCopyrightActionIntent:event */',
      values => values.includes(scene.restore.id) && values.includes('placement_restored'),
      async () => {
        await appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token: capability.token,
          now: scene.restorationAt,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court proceeding has commenced.',
        })
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).rejects.toThrow('Copyright action lease expired before completion')
    } finally {
      restore()
    }
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({ state: 'blocked' })
  })
  it.each(['denial', 'completion'] as const)(
    'commits a guest filing racing the %s write',
    async boundary => {
      installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      const capability = await issueCopyrightGuestCapability({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        issuedAt: scene.restorationAt,
        expiresAt: new Date(scene.restorationAt.getTime() + 24 * 60 * 60_000),
      })
      const current = await getImagePlacementForCopyright(scene.target.placement_id)
      if (!current) throw new Error('Withheld placement disappeared')
      await restoreImagePlacementForCopyright({
        placementId: current.placementId,
        expectedRevision: current.revision,
      })
      const tuple = {
        placementId: current.placementId,
        imageId: current.imageId,
        revision: current.revision + 1,
      }
      if (boundary === 'denial')
        await withholdImagePlacementForCopyright({
          placementId: tuple.placementId,
          expectedRevision: tuple.revision,
        })
      const claim = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
      if (!claim) throw new Error('Restoration claim disappeared')
      const outcomes = await raceCopyrightFinalizationWithGuestFiling({
        noticeId: scene.notice.id,
        boundary,
        action: () =>
          finalizeCopyrightActionAfterDelivery(
            scene.restore.id,
            claim.lease_token,
            'restore',
            scene.restorationAt,
            tuple,
          ),
        filing: () =>
          appendCopyrightGuestFiling({
            noticeId: scene.notice.id,
            token: capability.token,
            now: scene.restorationAt,
            kind: 'court_or_ccb_hold',
            statement: 'A federal court proceeding has commenced.',
          }),
      })
      const acceptable =
        boundary === 'denial'
          ? [
              { status: 'fulfilled', value: 'not_claimed' },
              {
                status: 'rejected',
                reason: new Error('Copyright action lease expired before completion'),
              },
            ]
          : [
              {
                status: 'rejected',
                reason: new Error('Copyright action lease expired before completion'),
              },
            ]
      expect(acceptable).toContainEqual(outcomes[0])
      expect(outcomes[1]).toMatchObject({
        status: 'fulfilled',
        value: { kind: 'court_or_ccb_hold' },
      })
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
          row => row.id === scene.restore.id,
        ),
      ).toMatchObject({ state: 'blocked' })
    },
  )
})

describe('copyright court event and renewal constraints', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['missing', 'another case'])(
    'rolls back the event and notice clock when its source is %s',
    async source => {
      const scene = await createCopyrightRestorationHoldFixture()
      const submissionId =
        source === 'missing'
          ? crypto.randomUUID()
          : (await createCopyrightRestorationHoldFixture()).aggregate.submissions[0]!.id
      const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      const beforeClocks = await readTestCopyrightGuestEventClocks(scene.notice.id)
      await expect(
        commitTestCopyrightCourtEvent(scene.notice.id, submissionId),
      ).rejects.toMatchObject({
        message: 'Deferred court event commit rejected',
        cause: { code: '23503', constraint: expect.stringContaining('submission_notice') },
      })
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
      expect(await readTestCopyrightGuestEventClocks(scene.notice.id)).toEqual(beforeClocks)
    },
  )

  it('keeps renewal/removal proofs and invalidates new ownership or failure blockers', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const claim = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    if (!claim) throw new Error('Restoration claim disappeared')
    const claimedGeneration = await readTestCopyrightBlockerGeneration(scene.notice.id)
    const beforeExpiry = await readTestCopyrightLeaseExpiry(scene.restore.id)
    await expect(renewTestCopyrightActionLease(scene.restore.id, claim.lease_token)).resolves.toBe(
      true,
    )
    expect(await readTestCopyrightBlockerGeneration(scene.notice.id)).toBe(claimedGeneration)
    expect((await readTestCopyrightLeaseExpiry(scene.restore.id)).getTime()).toBeGreaterThan(
      beforeExpiry.getTime(),
    )
    await expect(
      failCopyrightActionIntent({
        intentId: scene.restore.id,
        leaseToken: claim.lease_token,
        failedAt: scene.restorationAt,
        failureMessage: 'Provider failed.',
      }),
    ).resolves.toBe('retrying')
    const failedGeneration = await readTestCopyrightBlockerGeneration(scene.notice.id)
    expect(BigInt(failedGeneration)).toBeGreaterThan(BigInt(claimedGeneration))
    const next = await claimCopyrightActionIntent(
      scene.restore.id,
      new Date(scene.restorationAt.getTime() + 61_000),
    )
    if (!next) throw new Error('Next restoration claim disappeared')
    const nextGeneration = await readTestCopyrightBlockerGeneration(scene.notice.id)
    expect(BigInt(nextGeneration)).toBeGreaterThan(BigInt(failedGeneration))
    await completeTestCopyrightActionClaim(scene.restore.id, next.lease_token, scene.restorationAt)
    expect(await readTestCopyrightBlockerGeneration(scene.notice.id)).toBe(nextGeneration)
  })
  it('invalidates case proofs when an execution exhausts its failure attempts', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    for (const attempt of [1, 2, 3, 4, 5]) {
      const now = new Date(scene.restorationAt.getTime() + attempt * 60 * 60_000)
      const claim = await claimCopyrightActionIntent(scene.restore.id, now)
      if (!claim) throw new Error('Restoration claim disappeared')
      const before = await readTestCopyrightBlockerGeneration(scene.notice.id)
      expect(
        await failCopyrightActionIntent({
          intentId: scene.restore.id,
          leaseToken: claim.lease_token,
          failedAt: now,
          failureMessage: 'Provider failed.',
        }),
      ).toBe(attempt === 5 ? 'failed' : 'retrying')
      expect(BigInt(await readTestCopyrightBlockerGeneration(scene.notice.id))).toBeGreaterThan(
        BigInt(before),
      )
    }
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({ state: 'failed' })
  })
})
