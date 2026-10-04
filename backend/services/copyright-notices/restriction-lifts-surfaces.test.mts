import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, insertTestCommunityMember } from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  createTestLiftNotice,
  reactivateTestCommunityImageWithoutBinder,
  readTestLiftDeliveryIntents,
} from '@voucha/test-helpers/services/copyright-notices/administrator-lift-fixtures'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/services/copyright-notices/surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'
import { liftCopyrightRestrictionWithoutSetter } from './restriction-lifts.mts'
import { processCopyrightActionIntent } from './index.mts'

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
  return processCopyrightActionIntent(intent.id)
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
    await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
    const beforeIncidents = await getCopyrightRepeatInfringerAccount(fixture.actorUserId)
    const administrator = await createTestUserDirect({ administrator: true })
    await liftCopyrightRestrictionWithoutSetter({
      currentUser: administrator,
      noticeId,
      restrictionId: restriction.id,
      rationale: 'Verified provider-owned image should be restored.',
      liftedAt: new Date(),
    })
    expect(await restorationIntents(noticeId)).toEqual([])
    const reversed = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice' && row.text?.includes('reversed'),
    )
    expect(reversed).toHaveLength(2)
    expect(new Set(reversed.map(row => row.channel))).toEqual(new Set(['in_app', 'email']))
    await expect(applyRestore(noticeId, restriction.id)).resolves.toBe('applied')
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
    expect(await getCopyrightRepeatInfringerAccount(fixture.actorUserId)).toEqual(beforeIncidents)
    const statement = (await readTestCopyrightStatementIntents(noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(statement?.text).toContain('administrator')
    expect(statement?.text).toContain('visible')
    await expect(applyRestore(noticeId, restriction.id)).resolves.toBe('not_claimed')
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
      await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
      const administrator = await createTestUserDirect({ administrator: true })
      await liftCopyrightRestrictionWithoutSetter({
        currentUser: administrator,
        noticeId,
        restrictionId: restrictions[0]!.id,
        rationale: 'Provider-owned topic art can return.',
        liftedAt: new Date(),
      })
      await expect(applyRestore(noticeId, restrictions[0]!.id)).resolves.toBe('applied')
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
    await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
    const administrator = await createTestUserDirect({ administrator: true })
    await liftCopyrightRestrictionWithoutSetter({
      currentUser: administrator,
      noticeId,
      restrictionId: restrictions[0]!.id,
      rationale: 'No subscriber can respond.',
      liftedAt: new Date(),
    })
    await expect(applyRestore(noticeId, restrictions[0]!.id)).resolves.toBe('applied')
    expect(await restorationIntents(noticeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipient_user_id: owner.id, recipient_role: 'informed_owner' }),
      ]),
    )
  })

  it('refuses both a live community setter and a moderator without recording a lift', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    const { noticeId, restrictions, moderator } = await createTestLiftNotice([fixture])
    const input = {
      noticeId,
      restrictionId: restrictions[0]!.id,
      rationale: 'Insufficient responder test',
      liftedAt: new Date(),
    }
    const administrator = await createTestUserDirect({ administrator: true })
    await expect(
      liftCopyrightRestrictionWithoutSetter({ currentUser: administrator, ...input }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      liftCopyrightRestrictionWithoutSetter({ currentUser: moderator, ...input }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
