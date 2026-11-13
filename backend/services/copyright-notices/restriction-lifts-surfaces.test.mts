import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'
import { seedCommittedAdministratorLift } from '@voucha/test-helpers/copyright-reversal-scene'
import { seedCompletedReversalStatement } from '@voucha/test-helpers/copyright-restored-statement-fixture'
import {
  assertSurfaceLiftOutcome,
  assertSurfaceLiftGuard,
} from '@voucha/test-helpers/copyright-surface-lift-outcome'
import {
  assertSurfaceRestoreOutcome,
  assertSurfaceRestoreReplay,
} from '@voucha/test-helpers/copyright-surface-restore-outcome'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, insertTestCommunityMember } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  createTestLiftNotice,
  reactivateTestCommunityImageWithoutBinder,
  readTestLiftDeliveryIntents,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'

function restorationIntents(noticeId: string) {
  return readTestLiftDeliveryIntents(noticeId).then(rows =>
    rows.filter(row => row.delivery_kind === 'poster_restoration_notice'),
  )
}

async function applyRestore(noticeId: string, restrictionId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intent = aggregate?.actionIntents.find(
    row => row.copyright_restriction_id === restrictionId && row.action === 'restore',
  )
  if (!intent) throw new Error('Administrator restore intent missing')
  await seedCompletedReversalStatement(intent.id)
  return intent.id
}

describe('administrator lift for images without a live responder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('notifies signed-in claimant and the other community owner only after restoring an administrator-set image', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('community-profile-image', {
      actorAdministrator: true,
    })
    const otherOwner = await createTestUserDirect()
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: fixture.actorUserId,
      role: 'owner',
    })
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: otherOwner.id,
      role: 'owner',
    })
    const claimant = await createTestUserDirect({ withEmail: true })
    const { noticeId, restrictions, actionIntents } = await createTestLiftNotice([fixture], {
      claimantUserId: claimant.id,
      claimantEmail: `lift-${crypto.randomUUID()}@example.test`,
    })
    const restriction = restrictions[0]!
    const withhold = actionIntents.find(row => row.action === 'withhold')
    if (!withhold) throw new Error('Withhold intent missing')
    await seedRestorationSceneWithhold(withhold.id)
    const beforeIncidents = await readTestRepeatInfringerIncidents(fixture.actorUserId)
    const beforeOpenReviewIds = await readTestRepeatInfringerOpenReviewIds(fixture.actorUserId)
    const administrator = await createTestUserDirect({ administrator: true })
    await seedCommittedAdministratorLift(noticeId, restriction.id, administrator)
    expect(await restorationIntents(noticeId)).toEqual([])
    const reversed = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice' && row.text?.includes('reversed'),
    )
    expect(reversed).toHaveLength(2)
    expect(new Set(reversed.map(row => row.channel))).toEqual(new Set(['in_app', 'email']))
    const restoreId = await applyRestore(noticeId, restriction.id)
    const restoration = await restorationIntents(noticeId)
    expect(restoration).toHaveLength(2)
    expect(restoration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'in_app',
          recipient_user_id: otherOwner.id,
          recipient_role: 'informed_owner',
          target_path: expect.stringMatching(/^\/communities\//),
        }),
        expect.objectContaining({
          channel: 'email',
          recipient_user_id: otherOwner.id,
          recipient_role: 'informed_owner',
        }),
      ]),
    )
    expect(restoration.some(row => row.recipient_user_id === fixture.actorUserId)).toBe(false)
    expect(await readTestRepeatInfringerIncidents(fixture.actorUserId)).toEqual(beforeIncidents)
    expect(await readTestRepeatInfringerOpenReviewIds(fixture.actorUserId)).toEqual(
      beforeOpenReviewIds,
    )
    const statement = (await readTestCopyrightStatementIntents(noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(statement?.text).toContain('administrator')
    expect(statement?.text).toContain('visible')
    await assertSurfaceRestoreReplay({
      noticeId,
      restrictionId: restriction.id,
      placementId: fixture.placementId,
      restoreId,
    })
    expect(await restorationIntents(noticeId)).toHaveLength(2)
  })

  it.each(['topic-logo-image', 'topic-hero-image'] as const)(
    'lifts an administrator-owned %s without notifying a poster',
    async kind => {
      installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind)
      const { noticeId, restrictions, actionIntents } = await createTestLiftNotice([fixture])
      const withhold = actionIntents.find(row => row.action === 'withhold')
      if (!withhold) throw new Error('Withhold intent missing')
      await seedRestorationSceneWithhold(withhold.id)
      const administrator = await createTestUserDirect({ administrator: true })
      await seedCommittedAdministratorLift(noticeId, restrictions[0]!.id, administrator)
      await applyRestore(noticeId, restrictions[0]!.id)
      expect(await restorationIntents(noticeId)).toEqual([])
    },
  )

  it('lifts a community image whose current activation has no application binder', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    await reactivateTestCommunityImageWithoutBinder(fixture)
    const owner = await createTestUserDirect()
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: owner.id,
      role: 'owner',
    })
    const { noticeId, restrictions, actionIntents } = await createTestLiftNotice([fixture])
    const withhold = actionIntents.find(row => row.action === 'withhold')
    if (!withhold) throw new Error('Withhold intent missing')
    await seedRestorationSceneWithhold(withhold.id)
    const administrator = await createTestUserDirect({ administrator: true })
    await seedCommittedAdministratorLift(noticeId, restrictions[0]!.id, administrator)
    await applyRestore(noticeId, restrictions[0]!.id)
    expect(await restorationIntents(noticeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipient_user_id: owner.id, recipient_role: 'informed_owner' }),
      ]),
    )
  })

  it.each([
    { kind: 'community-profile-image', unbound: false },
    { kind: 'community-banner-image', unbound: false },
    { kind: 'topic-logo-image', unbound: false },
    { kind: 'topic-hero-image', unbound: false },
    { kind: 'community-banner-image', unbound: true },
  ] as const)(
    'atomically decides and delivers an administrator reversal for $kind (unbound: $unbound)',
    async ({ kind, unbound }) => {
      expect.hasAssertions()
      installTestMediaDeliveryEdge()
      const fixture = await createTestCopyrightImageFixture(kind, { actorAdministrator: true })
      if (unbound) await reactivateTestCommunityImageWithoutBinder(fixture)
      const administrator = await createTestUserDirect({ administrator: true })
      const claimant = await createTestUserDirect({ withEmail: true })
      const create = () =>
        createTestLiftNotice([fixture], {
          claimantUserId: claimant.id,
          claimantEmail: `lift-${crypto.randomUUID()}@example.test`,
        })
      const decision = await create()
      await assertSurfaceLiftOutcome(
        {
          currentUser: administrator,
          noticeId: decision.noticeId,
          restrictionId: decision.restrictions[0]!.id,
          rationale: 'Provider-owned image can return.',
          liftedAt: new Date(),
        },
        decision.targets[0]!.placement_id,
        [
          `claimant_decision_notice:email:${claimant.id}`,
          `claimant_decision_notice:in_app:${claimant.id}`,
        ],
      )
      // A separate committed decision always exercises the worker, even if the decision above aborted.
      const deliveryFixture = await createTestCopyrightImageFixture(kind, {
        actorAdministrator: true,
      })
      if (unbound) await reactivateTestCommunityImageWithoutBinder(deliveryFixture)
      const owner = await createTestUserDirect()
      const community = kind === 'community-profile-image' || kind === 'community-banner-image'
      if (community)
        await insertTestCommunityMember({
          communityId: deliveryFixture.ownerId,
          userId: owner.id,
          role: 'owner',
        })
      const delivery = await createTestLiftNotice([deliveryFixture])
      await seedRestorationSceneWithhold(delivery.actionIntents[0]!.id)
      await seedCommittedAdministratorLift(
        delivery.noticeId,
        delivery.restrictions[0]!.id,
        administrator,
      )
      const restore = (await getCopyrightNoticePrivateAggregate(
        delivery.noticeId,
      ))!.actionIntents.find(row => row.action === 'restore')!
      await assertSurfaceRestoreOutcome({
        noticeId: delivery.noticeId,
        restrictionId: delivery.restrictions[0]!.id,
        placementId: delivery.targets[0]!.placement_id,
        restoreId: restore.id,
        deliveries: community
          ? [
              `poster_restoration_notice:email:${owner.id}`,
              `poster_restoration_notice:in_app:${owner.id}`,
            ]
          : [],
        outcome: 'visible',
      })
    },
  )

  it('refuses both a live community setter and a moderator without recording a lift', async () => {
    expect.hasAssertions()
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    const { noticeId, restrictions, moderator } = await createTestLiftNotice([fixture])
    const input = {
      noticeId,
      restrictionId: restrictions[0]!.id,
      rationale: 'Insufficient responder test',
      liftedAt: new Date(),
    }
    const administrator = await createTestUserDirect({ administrator: true })
    await assertSurfaceLiftGuard(
      { currentUser: administrator, ...input },
      fixture.placementId,
      409,
      'A live account can respond to this restriction',
    )
    await assertSurfaceLiftGuard(
      { currentUser: moderator, ...input },
      fixture.placementId,
      403,
      'Forbidden',
    )
  })
})
