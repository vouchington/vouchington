import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import {
  readTestLiftReversalFacts,
  readTestLiftSourceFlags,
  replayTestLiftConfirmationConsequences,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestRepeatInfringerIncidents } from '@voucha/test-helpers/copyright-repeat-infringer'
import {
  createCommittedSurfaceRestriction,
  seedCommittedSourceReversal,
  seedCommittedAdministratorLift,
} from '@voucha/test-helpers/copyright-reversal-scene'
import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'
import { seedCompletedReversalStatement } from '@voucha/test-helpers/copyright-restored-statement-fixture'
import { assertReversalDeliveryOutcome } from '@voucha/test-helpers/copyright-reversal-delivery-outcome'
import { assertAdministratorLiftOutcome } from '@voucha/test-helpers/copyright-administrator-lift-outcome'

const onlySource = (source: 'review' | 'appeal' | 'administrator_lift') => ({
  reversal_authorized: true,
  reversal_by_review: source === 'review',
  reversal_by_appeal: source === 'appeal',
  reversal_by_administrator_lift: source === 'administrator_lift',
})

async function restoreIntent(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intent = aggregate?.actionIntents.find(row => row.action === 'restore')
  if (!intent) throw new Error('Committed restore obligation disappeared')
  return intent
}

describe('independent copyright reversal sources', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('leaves every reversal predicate false before any reversal is recorded', async () => {
    const image = await createTestCopyrightImageFixture('topic-logo-image')
    const scene = await createCommittedSurfaceRestriction([image])
    expect(await readTestLiftSourceFlags(scene.restrictions[0]!.id)).toEqual({
      reversal_authorized: false,
      reversal_by_review: false,
      reversal_by_appeal: false,
      reversal_by_administrator_lift: false,
    })
  })

  it('authorizes an administrator lift alone and preserves its owner-notice cause', async () => {
    installTestMediaDeliveryEdge()
    const image = await createTestCopyrightImageFixture('topic-logo-image')
    const scene = await createCommittedSurfaceRestriction([image], true)
    await seedRestorationSceneWithhold(scene.actionIntents[0]!.id)
    const administrator = await createTestUserDirect({ administrator: true })
    await seedCommittedAdministratorLift(scene.noticeId, scene.restrictions[0]!.id, administrator)
    expect(await readTestLiftReversalFacts(scene.restrictions[0]!.id)).toMatchObject(
      onlySource('administrator_lift'),
    )
    await seedCompletedReversalStatement((await restoreIntent(scene.noticeId)).id)
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions[0]?.lifted_at,
    ).toBeInstanceOf(Date)
  })

  it('authorizes a reviewed appeal alone and keeps appeal wording', async () => {
    installTestMediaDeliveryEdge()
    const image = await createTestCopyrightImageFixture('user-profile-image')
    const scene = await createCommittedSurfaceRestriction([image], true)
    await seedRestorationSceneWithhold(scene.actionIntents[0]!.id)
    expect(
      (await readTestRepeatInfringerIncidents(image.actorUserId)).find(
        row => row.copyright_notice_id === scene.noticeId,
      )?.is_operative,
    ).toBe(true)
    await seedCommittedSourceReversal(scene, 'appeal', image.actorUserId)
    expect(await readTestLiftReversalFacts(scene.restrictions[0]!.id)).toMatchObject(
      onlySource('appeal'),
    )
    expect(
      (await readTestRepeatInfringerIncidents(image.actorUserId)).find(
        row => row.copyright_notice_id === scene.noticeId,
      )?.is_operative,
    ).toBe(false)
    await seedCompletedReversalStatement((await restoreIntent(scene.noticeId)).id)
    const text = (await readTestCopyrightStatementIntents(scene.noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )?.text
    expect(text).toContain('the appeal reversed the decision')
  })

  describe('staydown registration after an administrator lift', () => {
    useStaydownMatching()
    it('removes its confirmed entry at the lift and cannot register it again', async () => {
      const image = await createTestCopyrightImageFixture('topic-logo-image')
      const sibling = await createTestCopyrightImageFixture('user-profile-image')
      const scene = await createCommittedSurfaceRestriction([image, sibling], true)
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_restriction_id: scene.restrictions[0]!.id }),
          expect.objectContaining({ copyright_restriction_id: scene.restrictions[1]!.id }),
        ]),
      )
      const administrator = await createTestUserDirect({ administrator: true })
      await seedCommittedAdministratorLift(scene.noticeId, scene.restrictions[0]!.id, administrator)
      const remaining = [
        expect.objectContaining({ copyright_restriction_id: scene.restrictions[1]!.id }),
      ]
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toEqual(remaining)
      await replayTestLiftConfirmationConsequences(scene.noticeId)
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toEqual(remaining)
    })
  })

  it('authorizes human review alone and keeps review wording', async () => {
    installTestMediaDeliveryEdge()
    const image = await createTestCopyrightImageFixture('post-image')
    const scene = await createCommittedSurfaceRestriction([image])
    await seedRestorationSceneWithhold(scene.actionIntents[0]!.id)
    await seedCommittedSourceReversal(scene, 'review', image.actorUserId)
    expect(await readTestLiftReversalFacts(scene.restrictions[0]!.id)).toMatchObject(
      onlySource('review'),
    )
    await seedCompletedReversalStatement((await restoreIntent(scene.noticeId)).id)
    const text = (await readTestCopyrightStatementIntents(scene.noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )?.text
    expect(text).toContain('human review reversed the decision')
  })

  it('commits every administrator lift fact together or returns its exact SSI conflict', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    const image = await createTestCopyrightImageFixture('topic-logo-image')
    const scene = await createCommittedSurfaceRestriction([image], true)
    await seedRestorationSceneWithhold(scene.actionIntents[0]!.id)
    await assertAdministratorLiftOutcome(
      {
        currentUser: await createTestUserDirect({ administrator: true }),
        noticeId: scene.noticeId,
        restrictionId: scene.restrictions[0]!.id,
        rationale: 'Provider-owned image restored.',
        liftedAt: new Date(),
      },
      image.placementId,
    )
  })

  it('keeps complete restore phases when its worker is aborted by SSI', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    const image = await createTestCopyrightImageFixture('post-image')
    const scene = await createCommittedSurfaceRestriction([image])
    await seedRestorationSceneWithhold(scene.actionIntents[0]!.id)
    await seedCommittedSourceReversal(scene, 'review', image.actorUserId)
    await assertReversalDeliveryOutcome({
      noticeId: scene.noticeId,
      restrictionId: scene.restrictions[0]!.id,
      placementId: image.placementId,
      restoreId: (await restoreIntent(scene.noticeId)).id,
      posterId: image.actorUserId,
    })
  })
})
