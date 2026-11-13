import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'
import { seedCommittedAdministratorLift } from '@voucha/test-helpers/copyright-reversal-scene'
import { seedRetainedRestorationStatement } from '@voucha/test-helpers/copyright-retained-restoration-fixture'
import { assertSurfaceRestoreOutcome } from '@voucha/test-helpers/copyright-surface-restore-outcome'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, insertTestCommunityMember } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  createTestLiftNotice,
  readTestLiftDeliveryIntents,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'

async function liftAndGetRestore(noticeId: string, restrictionId: string) {
  const administrator = await createTestUserDirect({ administrator: true })
  await seedCommittedAdministratorLift(noticeId, restrictionId, administrator)
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restore = aggregate?.actionIntents.find(
    row => row.action === 'restore' && row.copyright_restriction_id === restrictionId,
  )
  if (!restore) throw new Error('Restore intent missing')
  return restore.id
}

async function restorationIntents(noticeId: string) {
  return (await readTestLiftDeliveryIntents(noticeId)).filter(
    row => row.delivery_kind === 'poster_restoration_notice',
  )
}

describe('administrator lift restoration outcomes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('keeps the image hidden and tells other owners when a second restriction remains active', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('community-banner-image', {
      actorAdministrator: true,
    })
    const otherOwner = await createTestUserDirect()
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: otherOwner.id,
      role: 'owner',
    })
    const first = await createTestLiftNotice([fixture])
    const firstWithhold = first.actionIntents.find(row => row.action === 'withhold')
    if (!firstWithhold) throw new Error('Withhold intent missing')
    await seedRestorationSceneWithhold(firstWithhold.id)
    const second = await createTestLiftNotice([fixture])
    const restoreId = await liftAndGetRestore(first.noticeId, first.restrictions[0]!.id)
    await assertSurfaceRestoreOutcome({
      noticeId: first.noticeId,
      restrictionId: first.restrictions[0]!.id,
      placementId: fixture.placementId,
      restoreId,
      outcome: 'still_hidden',
      deliveries: [
        `poster_restoration_notice:email:${otherOwner.id}`,
        `poster_restoration_notice:in_app:${otherOwner.id}`,
      ],
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(second.noticeId))?.restrictions[0]?.lifted_at,
    ).toBeNull()
    // The wording projection has its own complete committed outcome; an SSI abort cannot skip it.
    const wordingFixture = await createTestCopyrightImageFixture('community-banner-image', {
      actorAdministrator: true,
    })
    await insertTestCommunityMember({
      communityId: wordingFixture.ownerId,
      userId: otherOwner.id,
      role: 'owner',
    })
    const wording = await createTestLiftNotice([wordingFixture])
    await seedRestorationSceneWithhold(wording.actionIntents[0]!.id)
    const wordingBlocker = await createTestLiftNotice([wordingFixture])
    const wordingRestore = await liftAndGetRestore(wording.noticeId, wording.restrictions[0]!.id)
    await seedRetainedRestorationStatement(wordingRestore)
    expect(await getImagePlacementForCopyright(wordingFixture.placementId)).toMatchObject({
      withheld: true,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(wording.noticeId))?.restrictions[0]?.lifted_at,
    ).not.toBeNull()
    expect(
      (await getCopyrightNoticePrivateAggregate(wordingBlocker.noticeId))?.restrictions[0]
        ?.lifted_at,
    ).toBeNull()
    const ended = (await readTestCopyrightStatementIntents(wording.noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(ended?.text).toContain('Another restriction keeps the image hidden')
    expect(ended?.text).not.toContain('will become visible again')
    expect(await restorationIntents(wording.noticeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: otherOwner.id,
          recipient_role: 'informed_owner',
        }),
      ]),
    )
  })

  it('does not send a restriction-ended notice before an unassessed court or CCB filing is resolved', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('community-profile-image', {
      actorAdministrator: true,
    })
    const otherOwner = await createTestUserDirect()
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: otherOwner.id,
      role: 'owner',
    })
    const { noticeId, restrictions, actionIntents } = await createTestLiftNotice([fixture])
    const withhold = actionIntents.find(row => row.action === 'withhold')
    if (!withhold) throw new Error('Withhold intent missing')
    await seedRestorationSceneWithhold(withhold.id)
    const restoreId = await liftAndGetRestore(noticeId, restrictions[0]!.id)
    await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    await assertSurfaceRestoreOutcome({
      noticeId,
      restrictionId: restrictions[0]!.id,
      placementId: fixture.placementId,
      restoreId,
      deliveries: [],
      outcome: 'blocked',
    })
    expect(await restorationIntents(noticeId)).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]?.lifted_at,
    ).toBeNull()
  })

  it('notifies a claimant once when two targets of the same notice are separately lifted', async () => {
    installTestMediaDeliveryEdge()
    const fixtures = await Promise.all([
      createTestCopyrightImageFixture('topic-logo-image'),
      createTestCopyrightImageFixture('topic-hero-image'),
    ])
    const { noticeId, restrictions, actionIntents } = await createTestLiftNotice(fixtures, {
      claimantEmail: `lift-${crypto.randomUUID()}@example.test`,
    })
    for (const withhold of actionIntents.filter(row => row.action === 'withhold')) {
      await seedRestorationSceneWithhold(withhold.id)
    }
    for (const restriction of restrictions) {
      await liftAndGetRestore(noticeId, restriction.id)
    }
    const reversed = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice' && row.text?.includes('reversed'),
    )
    expect(reversed).toHaveLength(1)
    expect(reversed[0]?.channel).toBe('email')
  })
})
