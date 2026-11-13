import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { isTestCopyrightPlacementWithheld } from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedCopyrightGuestCapabilities } from '@voucha/test-helpers/copyright-staff-case-states'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import {
  prepareActionDeliveryRestore,
  actionDeliveryCurrentTuple,
} from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { seedCompletedStatutoryContract } from '@voucha/test-helpers/copyright-statutory-contract-fixtures'
import { seedRetainedRestorePairMember } from '@voucha/test-helpers/copyright-restore-pair-fixtures'
import { assertRestorePairOverlap } from '@voucha/test-helpers/copyright-restore-pair-subjects'
import { assertRestoreCompletionAndFiling } from '@voucha/test-helpers/copyright-restore-filing-race'
import { assertOrdinaryRestorationJob } from '@voucha/test-helpers/copyright-ordinary-restoration-subjects'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'

async function createSharedRestorePair() {
  const first = await openHeldCounterNoticeRestore()
  const second = await openHeldCounterNoticeRestore(1, {
    claimant: first.claimant,
    placementId: first.target.placement_id,
    imageId: first.target.image_id,
  })
  const now = new Date(Math.max(first.restorationAt.getTime(), second.restorationAt.getTime()))
  return { first, second, now }
}

describe('copyright restore serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('couples both one-shot restores to complete retained or physically restored phases', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { first, second, now } = await createSharedRestorePair()
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(true)
    await assertRestorePairOverlap(first, second, now)
    const firstState = await getCopyrightNoticePrivateAggregate(first.notice.id)
    const secondState = await getCopyrightNoticePrivateAggregate(second.notice.id)
    const mayAllow =
      firstState!.restrictions.every(row => row.lifted_at !== null) &&
      secondState!.restrictions.every(row => row.lifted_at !== null)
    const allows = edge.put.mock.calls.flatMap(([record]) =>
      record.state === 'allow' ? [record] : [],
    )
    expect(allows.length === 0 || mayAllow).toBe(true)
  })

  it('sees an independently committed other lift on the real restore probe without retrying an actor', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    const { first, second, now } = await createSharedRestorePair()
    await seedRetainedRestorePairMember(first, now)
    const statements = await readTestCopyrightStatementIntents(first.notice.id)
    expect(
      statements.find(
        row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
      )!.text,
    ).toContain('Another restriction keeps the image hidden.')
    await assertOrdinaryRestorationJob(second, 'fresh', now)
  })

  it('allows the exact shared tuple only after both independent committed restrictions lifted', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { first, second, now } = await createSharedRestorePair()
    await seedRetainedRestorePairMember(first, now)
    await seedCompletedStatutoryContract({ ...second, restorationAt: now })
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(false)
    const tuple = await actionDeliveryCurrentTuple(first.target.placement_id)
    expect(edge.records.get(getImagePlacementDeliveryKey(tuple))?.state).toBe('allow')
    const [firstState, secondState] = await Promise.all([
      getCopyrightNoticePrivateAggregate(first.notice.id),
      getCopyrightNoticePrivateAggregate(second.notice.id),
    ])
    expect(firstState!.restrictions.map(row => row.lifted_at)).toEqual([now])
    expect(secondState!.restrictions.map(row => row.lifted_at)).toEqual([now])
  })

  it('preserves the actual completion and guest filing results when they compete for the same work item', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const at = new Date()
    const [capability] = await seedCopyrightGuestCapabilities({
      noticeId: scene.notice.id,
      issuedById: scene.moderator.id,
      expiresAt: new Date(at.getTime() + 60 * 60 * 1000),
      count: 1,
    })
    const prepared = await prepareActionDeliveryRestore(scene)
    await publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId)
    await assertRestoreCompletionAndFiling(scene, prepared, capability!, at)
  })
})
