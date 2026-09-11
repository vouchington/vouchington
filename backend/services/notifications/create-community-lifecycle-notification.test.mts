import { describe, expect, it } from 'vitest'
import { createTestUserDirect, insertTestCommunity } from '@voucha/test-helpers'
import {
  createCommunityLifecycleNotification,
  enqueueCommunityLifecycleNotificationPush,
} from './create-community-lifecycle-notification.mts'
import { listNotifications } from './list.mts'

describe('createCommunityLifecycleNotification', () => {
  it('persists a structured community target and stable event key', async () => {
    const user = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: user.id })
    const eventKey = `community-role-change:${community.id}:${user.id}:2026-07-11T00:00:00.000Z`

    const created = await createCommunityLifecycleNotification(
      {
        userId: user.id,
        communityId: community.id,
        entityType: 'community_role_change',
        eventKey,
        title: 'Your role changed',
        body: 'Your community role changed from member to moderator.',
      },
      {},
    )

    expect(created).not.toBeNull()
    const response = await listNotifications(user.id)
    const notification = response.notifications[created!.notificationId]
    expect(notification).toMatchObject({
      entity_type: 'community_role_change',
      community_id: community.id,
      event_key: eventKey,
      target_entity: { __entity_type: 'community', id: community.id },
      target_path: null,
    })
    expect(response.communities[community.id]).toEqual({
      id: community.id,
      slug: community.slug,
      name: community.name,
    })

    await expect(
      createCommunityLifecycleNotification(
        {
          userId: user.id,
          communityId: community.id,
          entityType: 'community_role_change',
          eventKey,
          title: 'Duplicate',
          body: 'Duplicate',
        },
        {},
      ),
    ).resolves.toBeNull()
  })
})

describe('enqueueCommunityLifecycleNotificationPush', () => {
  it('does not reject when the post-commit push enqueue fails', async () => {
    const enqueuePush = async () => {
      throw new Error('queue unavailable')
    }

    await expect(
      enqueueCommunityLifecycleNotificationPush(
        [{ userId: 'user-1', notificationId: 'notification-1' }],
        enqueuePush,
      ),
    ).resolves.toBeUndefined()
  })
})
