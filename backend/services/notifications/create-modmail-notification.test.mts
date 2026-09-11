import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createTestModmailThread,
} from '@voucha/test-helpers'
import { createModmailNotification } from './create-modmail-notification.mts'

async function setupCommunityAndThread(ownerId: string, subjectId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  const thread = await createTestModmailThread({
    communityId: community.id,
    subjectUserId: subjectId,
    modUserId: ownerId,
  })
  return { community, thread }
}

describe('create-modmail-notification', () => {
  it('creates a modmail notification', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const { community, thread } = await setupCommunityAndThread(owner.id, subject.id)

    const result = await createModmailNotification(
      owner.id,
      thread.id,
      `/communities/${community.slug}/settings/moderation`,
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(owner.id)
    expect(result[0]!.id).toBeTruthy()
  })

  it('upserts on conflict', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const { community, thread } = await setupCommunityAndThread(owner.id, subject.id)

    const targetPath = `/communities/${community.slug}/settings/moderation`
    const first = await createModmailNotification(owner.id, thread.id, targetPath)
    expect(first).toHaveLength(1)

    const second = await createModmailNotification(owner.id, thread.id, targetPath)
    expect(second).toHaveLength(1)
    expect(second[0]!.user_id).toBe(owner.id)
  })
})
