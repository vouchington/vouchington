import { claimCopyrightActionIntent, failCopyrightActionIntent } from './action-delivery-state.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mediaDeliveryEdgeEnvironment } from '@voucha/test-helpers/media-delivery-emulator'
import {
  createCopyrightCourtFilingScene,
  createMixedUnavailableCopyrightScene,
} from '@voucha/test-helpers/copyright-court-filing-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { raceCopyrightPlacementRestores } from '@voucha/test-helpers/copyright-unavailable-restore-race'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { updateProfileImageId } from '../my/identity.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'

describe('unavailable copyright restoration authority', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([1, 5])(
    'does not strand withholding when two unavailable filing grounds end concurrently on attempt %s',
    async attempt => {
      for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
        vi.stubEnv(key, value)
      const first = await createCopyrightCourtFilingScene()
      const second = await createCopyrightCourtFilingScene({ surface: first.surface })
      const a = await first.file()
      const b = await second.file()
      await updateProfileImageId(first.surface.actorUserId, null)
      await first.assess(a.id, false)
      await second.assess(b.id, false)
      const intents = await Promise.all(
        [first, second].map(async scene => {
          const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
          const intent = aggregate?.actionIntents.find(
            row => row.action === 'restore' && row.state === 'pending',
          )
          if (!intent) throw new Error('Filing decision did not queue restoration')
          return intent
        }),
      )
      for (let previous = 1; previous < attempt; previous += 1) {
        for (const intent of intents) {
          const when = new Date(Date.now() + previous * 86400_000)
          const claimed = await claimCopyrightActionIntent(intent.id, when)
          if (!claimed) throw new Error('Prior failure fixture could not claim its action')
          await failCopyrightActionIntent({
            intentId: intent.id,
            leaseToken: claimed.lease_token,
            failedAt: when,
            failureMessage: 'Earlier provider attempt failed.',
          })
        }
      }
      const now = new Date(Date.now() + attempt * 86400_000)
      const results = await raceCopyrightPlacementRestores(first.surface.placementId, [
        () => processCopyrightActionIntent(intents[0]!.id, now),
        () => processCopyrightActionIntent(intents[1]!.id, now),
      ])
      const restrictions = (
        await Promise.all(
          [first, second].map(scene => getCopyrightNoticePrivateAggregate(scene.notice.id)),
        )
      ).flatMap(aggregate => aggregate?.restrictions ?? [])
      const active = restrictions.filter(restriction => restriction.lifted_at === null)
      const placement = await getImagePlacementForCopyright(first.surface.placementId)
      expect({ active: active.length, withheld: placement?.withheld }).not.toEqual({
        active: 0,
        withheld: true,
      })
      expect(results).toEqual([
        { status: 'fulfilled', value: 'applied' },
        { status: 'fulfilled', value: 'applied' },
      ])
      expect(active).toHaveLength(0)
      expect(placement?.withheld).toBe(false)
    },
  )

  it('keeps an unassessed filing authoritative on a retired placement until that filing also clears', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const first = await scene.file()
    const second = await scene.file()
    await updateProfileImageId(scene.surface.actorUserId, null)
    await scene.assess(second.id, false)
    const blocked = (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
      row => row.action === 'restore',
    )
    if (!blocked) throw new Error('Filing decision did not retain restoration work')
    await expect(processCopyrightActionIntent(blocked.id)).resolves.toBe('blocked')
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.restrictions[0]?.lifted_at,
    ).toBeNull()
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(true)
    await scene.assess(first.id, false)
    const ready = (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
      row => row.action === 'restore' && row.state === 'pending',
    )
    if (!ready) throw new Error('Final filing decision did not reopen restoration')
    await expect(processCopyrightActionIntent(ready.id)).resolves.toBe('applied')
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(false)
  })

  it('retains another case ground on an unavailable placement and clears the flag when the final case ends', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const first = await createCopyrightCourtFilingScene()
    const second = await createCopyrightCourtFilingScene({ surface: first.surface })
    const a = await first.file()
    const b = await second.file()
    await updateProfileImageId(first.surface.actorUserId, null)
    for (const [scene, filing] of [
      [first, a],
      [second, b],
    ] as const) {
      await scene.assess(filing.id, false)
      const intent = (
        await getCopyrightNoticePrivateAggregate(scene.notice.id)
      )?.actionIntents.find(row => row.action === 'restore' && row.state === 'pending')
      if (!intent) throw new Error('Filing decision did not queue restoration')
      await expect(processCopyrightActionIntent(intent.id)).resolves.toBe('applied')
      expect((await getImagePlacementForCopyright(first.surface.placementId))?.withheld).toBe(
        scene === first,
      )
    }
  })

  it('keeps a filing ground withheld when an independent assessment-origin unavailable restore completes', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const { filing, submission, ordinary, intent } = await createMixedUnavailableCopyrightScene()
    await expect(processCopyrightActionIntent(intent.id)).resolves.toBe('applied')
    expect(
      (await getCopyrightNoticePrivateAggregate(ordinary.notice.id))?.restrictions[0]?.lifted_at,
    ).toBeInstanceOf(Date)
    expect(
      (await getCopyrightNoticePrivateAggregate(filing.notice.id))?.restrictions[0]?.lifted_at,
    ).toBeNull()
    expect((await getImagePlacementForCopyright(filing.surface.placementId))?.withheld).toBe(true)
    await filing.assess(submission.id, false)
    const ready = (await getCopyrightNoticePrivateAggregate(filing.notice.id))?.actionIntents.find(
      row => row.action === 'restore' && row.state === 'pending',
    )
    if (!ready) throw new Error('Filing release did not create restoration work')
    await expect(processCopyrightActionIntent(ready.id)).resolves.toBe('applied')
    expect((await getImagePlacementForCopyright(filing.surface.placementId))?.withheld).toBe(false)
  })

  it('completes concurrent assessment-origin and filing-origin unavailable releases without conflicts', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const { filing, submission, ordinary, intent } = await createMixedUnavailableCopyrightScene()
    await filing.assess(submission.id, false)
    const ready = (await getCopyrightNoticePrivateAggregate(filing.notice.id))?.actionIntents.find(
      row => row.action === 'restore' && row.state === 'pending',
    )
    if (!ready) throw new Error('Filing release did not create restoration work')
    const results = await raceCopyrightPlacementRestores(filing.surface.placementId, [
      () => processCopyrightActionIntent(intent.id),
      () => processCopyrightActionIntent(ready.id),
    ])
    expect(results).toEqual([
      { status: 'fulfilled', value: 'applied' },
      { status: 'fulfilled', value: 'applied' },
    ])
    const active = (
      await Promise.all(
        [filing, ordinary].map(scene => getCopyrightNoticePrivateAggregate(scene.notice.id)),
      )
    )
      .flatMap(aggregate => aggregate?.restrictions ?? [])
      .filter(restriction => restriction.lifted_at === null)
    expect(active).toHaveLength(0)
    expect((await getImagePlacementForCopyright(filing.surface.placementId))?.withheld).toBe(false)
  })
})
