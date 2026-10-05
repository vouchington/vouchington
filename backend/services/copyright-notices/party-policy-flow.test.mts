import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import {
  createTestCopyrightImageFixture,
  type TestCopyrightImageKind,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  createTestLiftNotice,
  reactivateTestCommunityImageWithoutBinder,
  readTestLiftDeliveryIntents,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getCopyrightParticipantNoticeDetail } from './read-models.mts'
import { createCopyrightAppeal, createCopyrightCounterNotice } from './submissions.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'

function counterInput(targetId: string) {
  return {
    name: 'Image owner',
    address: `${crypto.randomUUID()} Main Street`,
    telephone: '555-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Image owner',
    targetIds: [targetId],
  }
}

async function expectChannels(
  noticeId: string,
  recipientId: string,
  role: 'poster' | 'informed_owner',
  kind: 'poster_restriction_notice' | 'owner_information_notice',
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intents = aggregate?.deliveryIntents.filter(
    intent =>
      intent.recipient_user_id === recipientId &&
      intent.recipient_role === role &&
      intent.delivery_kind === kind,
  )
  expect(intents).toHaveLength(2)
  expect(new Set(intents?.map(intent => intent.channel))).toEqual(new Set(['email', 'in_app']))
  return intents
}

async function expectIncident(noticeId: string, userId: string, is_operative: boolean) {
  const account = await getCopyrightRepeatInfringerAccount(userId)
  const operativeIncident = expect.objectContaining({ is_operative: true })
  expect(account.incidents.filter(row => row.copyright_notice_id === noticeId)).toEqual(
    is_operative ? [operativeIncident] : [],
  )
}

describe('copyright subscriber and informational-owner flows', () => {
  it.each(['user-profile-image', 'user-profile-link-image'] as const)(
    'keeps an administrator-owned %s in the subscriber and strike flow',
    async kind => {
      const fixture = await createTestCopyrightImageFixture(kind, {
        actorAdministrator: true,
        actorWithEmail: true,
      })
      const { noticeId, targets } = await createTestLiftNotice([fixture], {
        claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
      })
      const owner = await getTestPrivateUserById(fixture.actorUserId)
      if (!owner) throw new Error('Administrator fixture missing')
      const targetId = targets[0]!.id
      await expectChannels(noticeId, owner.id, 'poster', 'poster_restriction_notice')
      const detail = await getCopyrightParticipantNoticeDetail(noticeId, owner)
      expect(detail).toMatchObject({
        viewer_role: 'staff',
        respondable_target_ids: [targetId],
      })
      await expect(
        createCopyrightAppeal(owner, noticeId, crypto.randomUUID(), {
          reason: 'I own this image.',
          targetIds: [targetId],
        }),
      ).resolves.toMatchObject({ isDuplicate: false })
      await expect(
        createCopyrightCounterNotice(owner, noticeId, crypto.randomUUID(), counterInput(targetId)),
      ).resolves.toMatchObject({ isDuplicate: false })
      await expectIncident(noticeId, owner.id, true)
    },
  )

  it('treats a moderator setting a community image as a subscriber and keeps the other owner informational', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image', {
      actorModerator: true,
      actorWithEmail: true,
    })
    const setter = await getTestPrivateUserById(fixture.actorUserId)
    if (!setter) throw new Error('Moderator fixture missing')
    expect(setter.roles).toContain('moderator')
    const otherOwner = await createTestUserDirect({ withEmail: true })
    for (const userId of [setter.id, otherOwner.id]) {
      await insertTestCommunityMember({ communityId: fixture.ownerId, userId, role: 'owner' })
    }
    const { noticeId, targets } = await createTestLiftNotice([fixture], {
      claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
    })
    const targetId = targets[0]!.id
    await expectChannels(noticeId, setter.id, 'poster', 'poster_restriction_notice')
    await expectChannels(noticeId, otherOwner.id, 'informed_owner', 'owner_information_notice')
    const informedIntents = await readTestLiftDeliveryIntents(noticeId)
    expect(
      informedIntents.find(
        intent =>
          intent.recipient_user_id === otherOwner.id &&
          intent.delivery_kind === 'owner_information_notice' &&
          intent.channel === 'in_app',
      )?.target_path,
    ).toMatch(/^\/communities\//)
    expect(await getCopyrightParticipantNoticeDetail(noticeId, setter)).toMatchObject({
      viewer_role: 'staff',
      respondable_target_ids: [targetId],
    })
    await expect(
      createCopyrightAppeal(setter, noticeId, crypto.randomUUID(), {
        reason: 'My community image was removed.',
        targetIds: [targetId],
      }),
    ).resolves.toMatchObject({ isDuplicate: false })
    await expect(
      createCopyrightCounterNotice(setter, noticeId, crypto.randomUUID(), counterInput(targetId)),
    ).resolves.toMatchObject({ isDuplicate: false })
    expect(await getCopyrightParticipantNoticeDetail(noticeId, otherOwner)).toBeNull()
    await expect(
      createCopyrightAppeal(otherOwner, noticeId, crypto.randomUUID(), {
        reason: 'I also own the community.',
        targetIds: [targetId],
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      createCopyrightCounterNotice(
        otherOwner,
        noticeId,
        crypto.randomUUID(),
        counterInput(targetId),
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expectIncident(noticeId, setter.id, true)
    await expectIncident(noticeId, otherOwner.id, false)
  })

  it.each(['administrator', 'unknown'] as const)(
    'informs owners without creating a subscriber for a %s community binding',
    async binding => {
      const fixture = await createTestCopyrightImageFixture('community-profile-image', {
        actorAdministrator: binding === 'administrator',
        actorWithEmail: true,
      })
      if (binding === 'unknown') await reactivateTestCommunityImageWithoutBinder(fixture)
      const owner = await createTestUserDirect({ withEmail: true })
      await insertTestCommunityMember({
        communityId: fixture.ownerId,
        userId: owner.id,
        role: 'owner',
      })
      const { noticeId, targets } = await createTestLiftNotice([fixture], {
        claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
      })
      const targetId = targets[0]!.id
      await expectChannels(noticeId, owner.id, 'informed_owner', 'owner_information_notice')
      expect(await getCopyrightParticipantNoticeDetail(noticeId, owner)).toBeNull()
      await expect(
        createCopyrightCounterNotice(owner, noticeId, crypto.randomUUID(), counterInput(targetId)),
      ).rejects.toMatchObject({ status: 403 })
      await expectIncident(noticeId, owner.id, false)
      const setter = await getTestPrivateUserById(fixture.actorUserId)
      if (!setter) throw new Error('Setter fixture missing')
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(
        aggregate?.deliveryIntents.filter(intent => intent.recipient_role === 'poster'),
      ).toEqual([])
      await expectIncident(noticeId, setter.id, false)
      await expect(
        createCopyrightCounterNotice(setter, noticeId, crypto.randomUUID(), counterInput(targetId)),
      ).rejects.toMatchObject({ status: 403 })
    },
  )

  it.each(['topic-logo-image', 'topic-hero-image'] as TestCopyrightImageKind[])(
    'creates only a claimant decision for a %s',
    async kind => {
      const fixture = await createTestCopyrightImageFixture(kind)
      const { noticeId, targets } = await createTestLiftNotice([fixture], {
        claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
      })
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(
        aggregate?.deliveryIntents.filter(
          intent =>
            intent.recipient_role === 'poster' || intent.recipient_role === 'informed_owner',
        ),
      ).toEqual([])
      expect(
        aggregate?.deliveryIntents.some(
          intent => intent.delivery_kind === 'claimant_decision_notice',
        ),
      ).toBe(true)
      const actor = await getTestPrivateUserById(fixture.actorUserId)
      if (!actor) throw new Error('Topic administrator fixture missing')
      await expectIncident(noticeId, actor.id, false)
      await expect(
        createCopyrightCounterNotice(
          actor,
          noticeId,
          crypto.randomUUID(),
          counterInput(targets[0]!.id),
        ),
      ).rejects.toMatchObject({ status: 403 })
    },
  )
})
