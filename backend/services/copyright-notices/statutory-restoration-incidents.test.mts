import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  readTestLiftReversalFacts,
  readTestLiftSourceFlags,
  replayTestLiftConfirmationConsequences,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { readTestClaimantMisuseSummary } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import {
  seedCompletedStatutoryContract,
  seedStatutoryContractHold,
  seedStatutoryContractHoldResolution,
} from '@voucha/test-helpers/copyright-statutory-contract-fixtures'
import { assertStatutoryContractJob } from '@voucha/test-helpers/copyright-statutory-contract-job'

const noReversalSource = {
  reversal_authorized: false,
  reversal_by_review: false,
  reversal_by_appeal: false,
  reversal_by_administrator_lift: false,
}
async function readIncident(accountId: string, noticeId: string) {
  return (await readTestRepeatInfringerIncidents(accountId)).find(
    row => row.copyright_notice_id === noticeId,
  )
}

describe('statutory restoration and repeat-infringer incidents', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('completes the statutory incident change as one legal phase while leaving reversal sources and ledger alone', async () => {
    const scene = await openHeldCounterNoticeRestore()
    expect((await readIncident(scene.claimant.id, scene.notice.id))?.is_operative).toBe(true)
    const ledger = await readTestClaimantMisuseSummary(scene.claimant.id)
    await assertStatutoryContractJob(scene)
    await expect(readTestLiftSourceFlags(scene.restriction.id)).resolves.toEqual(noReversalSource)
    await expect(readTestLiftReversalFacts(scene.restriction.id)).resolves.toMatchObject(
      noReversalSource,
    )
    await expect(readTestClaimantMisuseSummary(scene.claimant.id)).resolves.toEqual(ledger)
  })

  it('stops counting an independently committed statutory completion without inventing a reversal', async () => {
    const scene = await openHeldCounterNoticeRestore()
    const ledger = await readTestClaimantMisuseSummary(scene.claimant.id)
    await seedCompletedStatutoryContract(scene)
    expect((await readIncident(scene.claimant.id, scene.notice.id))?.is_operative).toBe(false)
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(aggregate!.actionIntents.find(row => row.id === scene.restore.id)!.state).toBe(
      'completed',
    )
    await expect(readTestLiftSourceFlags(scene.restriction.id)).resolves.toEqual(noReversalSource)
    await expect(readTestLiftReversalFacts(scene.restriction.id)).resolves.toMatchObject(
      noReversalSource,
    )
    await expect(readTestClaimantMisuseSummary(scene.claimant.id)).resolves.toEqual(ledger)
  })

  it('opens no repeat-infringer review when one of two incidents was restored this way', async () => {
    const scene = await openHeldCounterNoticeRestore()
    await seedCompletedStatutoryContract(scene)
    const secondNoticeId = await confirmTestRepeatInfringerNotice(
      scene.claimant.id,
      scene.moderator,
      'statutory restoration',
    )
    const account = await readTestRepeatInfringerIncidents(scene.claimant.id)
    expect(account.flatMap(row => (row.is_operative ? [row.copyright_notice_id] : []))).toEqual([
      secondNoticeId,
    ])
    expect(await readTestRepeatInfringerOpenReviewIds(scene.claimant.id)).toEqual([])
  })

  it('keeps counting a court-blocked incident and then runs the reopened restore once', async () => {
    const scene = await openHeldCounterNoticeRestore()
    const hold = await seedStatutoryContractHold(scene)
    await assertStatutoryContractJob(scene, true)
    const blocked = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(blocked!.actionIntents.find(row => row.id === scene.restore.id)!.state).toBe('blocked')
    await replayTestLiftConfirmationConsequences(scene.notice.id)
    expect((await readIncident(scene.claimant.id, scene.notice.id))?.is_operative).toBe(true)
    await seedStatutoryContractHoldResolution(scene, hold.id)
    await assertStatutoryContractJob(scene)
  })

  describe('staydown registration', () => {
    useStaydownMatching()
    it('holds no entry for an independently completed statutory restoration and never registers it again', async () => {
      const scene = await openHeldCounterNoticeRestore()
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toHaveLength(1)
      await seedCompletedStatutoryContract(scene)
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toEqual([])
      await replayTestLiftConfirmationConsequences(scene.notice.id)
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toEqual([])
    })
    it('keeps the real restore job staydown changes coupled to its complete legal phase', async () => {
      expect.hasAssertions()
      const scene = await openHeldCounterNoticeRestore()
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toHaveLength(1)
      await assertStatutoryContractJob(scene)
    })
  })
})
