import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { listNotifications } from '@services/notifications/list'
import { renderListedNotification } from '../../test-helpers/services/notifications/render-listed-notification.mts'
import { getCommunityMember } from './members/get.mts'
import { initiateOwnershipTransfer } from './ownership-transfer.mts'

describe('ownership transfer notifications', () => {
  it('notifies the previous and new owners with recipient-specific copy', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])

    await initiateOwnershipTransfer(owner.id, community, moderator.id)

    const [previousOwner, newOwner] = await Promise.all([
      listNotifications(owner.id),
      listNotifications(moderator.id),
    ])
    const titleOf = (page: typeof previousOwner, kind: string) => {
      const found = Object.values(page.notifications).find(item => item.kind === kind)
      return found ? renderListedNotification(page, found.id).title : undefined
    }
    expect(titleOf(previousOwner, 'community_ownership_transferred_away')).toBe(
      `Ownership of ${community.name} was transferred`,
    )
    expect(titleOf(newOwner, 'community_ownership_received')).toBe(`You now own ${community.name}`)
  })

  it('rolls back roles and notification rows when the target is ineligible', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])

    await expect(initiateOwnershipTransfer(owner.id, community, member.id)).rejects.toMatchObject({
      status: 422,
    })

    expect((await getCommunityMember(community.id, owner.id))?.role).toBe('owner')
    expect((await getCommunityMember(community.id, member.id))?.role).toBe('member')
    for (const userId of [owner.id, member.id]) {
      expect(Object.values((await listNotifications(userId)).notifications)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entity_type: 'community_ownership_transfer' }),
        ]),
      )
    }
  })
})
