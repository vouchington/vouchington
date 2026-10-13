import { createTestUserDirect } from './entities/users-direct.mts'
import { insertTestCommunity } from './entities/communities.mts'
import { insertTestCommunityMember } from './entities/community-members.mts'
import { insertTestPost } from './entities/posts.mts'
import { createCommunityActivityDigestBatch } from '../services/notifications/community-activity-digest.mts'

type DigestInput = { windowStart: Date; windowEnd: Date }

export async function runDigestBatchForUser(userId: string, input: DigestInput) {
  return createCommunityActivityDigestBatch({
    ...input,
    afterUserId: beforeDigestUserId(userId),
    throughUserId: userId,
    now: new Date(),
  })
}

export async function insertDigestPostTypeFixtures(
  userId: string,
  communityId: string,
  start: Date,
  now: Date,
) {
  const discussionId = await insertTestPost({
    title: 'Top discussion',
    slug: `older-top-${userId}`,
    markdown: 'Discussion',
    createdById: userId,
    communityId: communityId,
    createdAt: new Date(start.getTime() - 86_400_000),
  })
  await Promise.all([
    insertTestPost({
      title: 'Reply',
      slug: `reply-${userId}`,
      markdown: 'Reply',
      postType: 'comment',
      createdById: userId,
      communityId: communityId,
      rootId: discussionId,
      parentId: discussionId,
      createdAt: now,
    }),
    insertTestPost({
      title: 'Review',
      slug: `review-${userId}`,
      markdown: 'Review',
      postType: 'review',
      createdById: userId,
      communityId: communityId,
      createdAt: now,
    }),
    insertTestPost({
      title: 'Data',
      slug: `data-${userId}`,
      markdown: 'Data',
      postType: 'data_point',
      createdById: userId,
      communityId: communityId,
      createdAt: now,
    }),
  ])
}

function beforeDigestUserId(userId: string) {
  const compact = userId.replaceAll('-', '')
  const previous = (BigInt(`0x${compact}`) - 1n).toString(16).padStart(32, '0')
  return [8, 12, 16, 20].reduce(
    (value, offset, index) => `${value.slice(0, offset + index)}-${value.slice(offset + index)}`,
    previous,
  )
}

export async function createDigestRecipientRangeFixtures(now: Date) {
  const first = await createTestUserDirect()
  const second = await createTestUserDirect()
  const [owner, foreign] = first.id < second.id ? [first, second] : [second, first]
  for (const user of [owner, foreign]) {
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
      createdAt: now,
    })
  }
  return {
    owner,
    foreign,
    input: {
      windowStart: new Date(now.getTime() - 3_600_000),
      windowEnd: new Date(now.getTime() + 3_600_000),
    },
  }
}

export async function runGlobalDigestBatchForTest(
  ownerId: string,
  foreignId: string,
  input: DigestInput,
) {
  let afterUserId = beforeDigestUserId(ownerId)
  const created: Array<{ userId: string; notificationId: string }> = []
  while (afterUserId < foreignId) {
    const result = await createCommunityActivityDigestBatch({
      ...input,
      afterUserId,
      now: new Date(),
    })
    created.push(...result.created)
    if (result.nextUserId === null) break
    const cursorAdvanced = result.nextUserId > afterUserId
    if (!cursorAdvanced) throw new Error('Global digest recipient cursor did not advance')
    afterUserId = result.nextUserId
  }
  return { created }
}
