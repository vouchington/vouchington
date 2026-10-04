import { describe, expect, it } from 'vitest'
import { read, write } from '@data-stores/psql'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
  TEST_COPYRIGHT_IMAGE_KINDS,
} from '@voucha/test-helpers/services/copyright-notices/surface-target-fixtures'
import sql from 'sql-template-strings'
import {
  copyrightPlacementPartiesSql,
  type CopyrightPlacementPartyPurpose,
} from './placement-parties.mts'

async function parties(
  targetId: string,
  purpose: CopyrightPlacementPartyPurpose,
): Promise<string[]> {
  const statement = sql`/* testCopyrightPlacementParties */
    SELECT DISTINCT party.user_id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql(purpose))
  statement.append(sql` party WHERE target.id = ${targetId} AND party.user_id IS NOT NULL
    ORDER BY party.user_id`)
  const { rows } = await read<{ user_id: string }>(statement)
  return rows.map(row => row.user_id)
}

describe('copyright placement party policy', () => {
  it.each(TEST_COPYRIGHT_IMAGE_KINDS)('assigns the D1 party sets for %s', async kind => {
    const fixture = await createTestCopyrightImageFixture(kind)
    const otherOwner = kind.startsWith('community-') ? await createTestUserDirect() : null
    if (otherOwner) {
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
    }
    const { targetId } = await createTestCopyrightRestrictionForImage(fixture)
    const direct = kind.startsWith('topic-') ? [] : [fixture.actorUserId]
    for (const purpose of ['notify', 'respond', 'strike'] as const) {
      expect(await parties(targetId, purpose)).toEqual(direct)
    }
    expect(await parties(targetId, 'retain')).toEqual(direct)
    expect(await parties(targetId, 'inform')).toEqual(otherOwner ? [otherOwner.id] : [])
  })

  it.each(['user-profile-image', 'user-profile-link-image'] as const)(
    'treats an administrator-owned %s as the profile owner',
    async kind => {
      const fixture = await createTestCopyrightImageFixture(kind, { actorAdministrator: true })
      const { targetId } = await createTestCopyrightRestrictionForImage(fixture)
      for (const purpose of ['notify', 'respond', 'strike', 'retain'] as const) {
        expect(await parties(targetId, purpose)).toEqual([fixture.actorUserId])
      }
      expect(await parties(targetId, 'inform')).toEqual([])
    },
  )

  it('never gives an administrator community setter response or strike rights', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image', {
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
    const { targetId } = await createTestCopyrightRestrictionForImage(fixture)
    for (const purpose of ['notify', 'respond', 'strike'] as const) {
      expect(await parties(targetId, purpose)).toEqual([])
    }
    expect(await parties(targetId, 'retain')).toEqual([fixture.actorUserId])
    expect(await parties(targetId, 'inform')).toEqual([otherOwner.id])
  })

  it('does not borrow an old binder after trigger-only community reactivation', async () => {
    const fixture = await createTestCopyrightImageFixture('community-profile-image')
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
    await fixture.detach()
    await write(sql`/* testCopyrightTriggerOnlyReactivation */
      UPDATE communities SET profile_image_id = ${fixture.imageId} WHERE id = ${fixture.ownerId}`)
    const { targetId } = await createTestCopyrightRestrictionForImage(fixture)
    for (const purpose of ['notify', 'respond', 'strike', 'retain'] as const) {
      expect(await parties(targetId, purpose)).toEqual([])
    }
    expect(await parties(targetId, 'inform')).toEqual(
      [fixture.actorUserId, otherOwner.id].toSorted(),
    )
  })
})
