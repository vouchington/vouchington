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
import { appendCopyrightNoticeSubmission, processCopyrightActionIntent } from './index.mts'
import { liftCopyrightRestrictionWithoutSetter } from './restriction-lifts.mts'

async function liftAndGetRestore(noticeId: string, restrictionId: string) {
  const administrator = await createTestUserDirect({ administrator: true })
  await liftCopyrightRestrictionWithoutSetter({
    currentUser: administrator,
    noticeId,
    restrictionId,
    rationale: 'Provider restoration reviewed.',
    liftedAt: new Date(),
  })
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
    await expect(processCopyrightActionIntent(firstWithhold.id)).resolves.toBe('applied')
    const second = await createTestLiftNotice([fixture])
    const restoreId = await liftAndGetRestore(first.noticeId, first.restrictions[0]!.id)
    await expect(processCopyrightActionIntent(restoreId)).resolves.toBe('applied')
    expect(await getImagePlacementForCopyright(fixture.placementId)).toMatchObject({
      withheld: true,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(first.noticeId))?.restrictions[0]?.lifted_at,
    ).not.toBeNull()
    expect(
      (await getCopyrightNoticePrivateAggregate(second.noticeId))?.restrictions[0]?.lifted_at,
    ).toBeNull()
    const ended = (await readTestCopyrightStatementIntents(first.noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(ended?.text).toContain('Another restriction keeps the image hidden')
    expect(ended?.text).not.toContain('will become visible again')
    expect(await restorationIntents(first.noticeId)).toEqual(
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
    await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
    const restoreId = await liftAndGetRestore(noticeId, restrictions[0]!.id)
    await appendCopyrightNoticeSubmission({
      noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    await expect(processCopyrightActionIntent(restoreId)).resolves.toBe('blocked')
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
      await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
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
