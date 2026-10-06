import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightDeliveryDependencies,
  type CopyrightTestDeliveryPublisher,
} from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  readTestLiftReversalFacts,
  readTestLiftSourceFlags,
  replayTestLiftConfirmationConsequences,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import type { PrivateUser } from '@services/users/types'
import { processCopyrightActionIntent, resolveCopyrightLegalHold } from './index.mts'
import { readClaimantMisuseSummary } from './claimant-misuse-summary.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'

const publish: CopyrightTestDeliveryPublisher = async () => undefined
const noReversalSource = {
  reversal_authorized: false,
  reversal_by_review: false,
  reversal_by_appeal: false,
  reversal_by_administrator_lift: false,
}

type Scene = Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>

function openScene(): Promise<Scene> {
  return openHeldCounterNoticeRestore(createTestCopyrightDeliveryDependencies(publish))
}

async function readIncident(accountUserId: string, noticeId: string) {
  const account = await getCopyrightRepeatInfringerAccount(accountUserId)
  return account.incidents.find(incident => incident.copyright_notice_id === noticeId)
}

async function readRestoreState(noticeId: string): Promise<string | undefined> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  return aggregate?.actionIntents.find(intent => intent.action === 'restore')?.state
}

function applyRestore(scene: Scene) {
  return processCopyrightActionIntent(
    scene.restore.id,
    scene.restorationAt,
    createTestCopyrightDeliveryDependencies(publish),
  )
}

describe('statutory restoration and repeat-infringer incidents', () => {
  it('stops counting the incident when the restoration completes, leaving the reversal sources and ledger alone', async () => {
    const scene = await openScene()
    const accountId = scene.claimant.id
    expect((await readIncident(accountId, scene.notice.id))?.is_operative).toBe(true)
    const ledgerBefore = await readClaimantMisuseSummary(accountId)

    await expect(applyRestore(scene)).resolves.toBe('applied')

    await expect(readRestoreState(scene.notice.id)).resolves.toBe('completed')
    expect((await readIncident(accountId, scene.notice.id))?.is_operative).toBe(false)
    await expect(readTestLiftSourceFlags(scene.restriction.id)).resolves.toEqual(noReversalSource)
    await expect(readTestLiftReversalFacts(scene.restriction.id)).resolves.toMatchObject(
      noReversalSource,
    )
    await expect(readClaimantMisuseSummary(accountId)).resolves.toEqual(ledgerBefore)
  })

  it('opens no repeat-infringer review when one of two incidents was restored this way', async () => {
    const scene = await openScene()
    const accountId = scene.claimant.id
    await expect(applyRestore(scene)).resolves.toBe('applied')

    const secondNoticeId = await confirmTestRepeatInfringerNotice(
      accountId,
      scene.moderator as PrivateUser,
      'statutory restoration',
    )

    const account = await getCopyrightRepeatInfringerAccount(accountId)
    expect(
      account.incidents.filter(incident => incident.is_operative).map(i => i.copyright_notice_id),
    ).toEqual([secondNoticeId])
    expect(account.open_review_id).toBeNull()
  })

  it('keeps counting the incident while a court hold blocks the restoration', async () => {
    const scene = await openScene()
    const accountId = scene.claimant.id
    const hold = await recordOrdinaryCopyrightHold(
      scene,
      createTestCopyrightDeliveryDependencies(publish).prepublishImagePlacementDenial,
    )

    await expect(applyRestore(scene)).resolves.toBe('blocked')
    await expect(readRestoreState(scene.notice.id)).resolves.toBe('blocked')
    // A blocked intent also carries `completed_at`; only a `completed` restore ends the incident.
    await replayTestLiftConfirmationConsequences(scene.notice.id)
    expect((await readIncident(accountId, scene.notice.id))?.is_operative).toBe(true)

    await resolveCopyrightLegalHold({
      currentUser: scene.moderator,
      assessmentId: hold.id,
      resolvedAt: scene.restorationAt,
      resolutionKind: 'dismissed',
      rationale: 'The proceeding ended.',
    })
    await expect(applyRestore(scene)).resolves.toBe('applied')
    expect((await readIncident(accountId, scene.notice.id))?.is_operative).toBe(false)
  })

  describe('staydown registration', () => {
    useStaydownMatching()

    it('holds no entry for a statutorily restored image and does not register it again', async () => {
      const scene = await openScene()
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toHaveLength(1)

      await expect(applyRestore(scene)).resolves.toBe('applied')
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toEqual([])

      await replayTestLiftConfirmationConsequences(scene.notice.id)
      expect(await readCopyrightStaydownEntries(scene.notice.id)).toEqual([])
    })
  })
})
