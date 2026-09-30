import type { PrivateUser } from '@voucha/types/entities/user'
import { followUser } from './test-entities.mts'
import { createTestUser } from './users.mts'

type BroadcastPrivacyAudience = {
  creator: PrivateUser
  follower: PrivateUser
  mutualFollower: PrivateUser
  stranger: PrivateUser
}

export async function createBroadcastPrivacyAudience(): Promise<BroadcastPrivacyAudience> {
  const creator = await createTestUser()
  const follower = await createTestUser()
  const mutualFollower = await createTestUser()
  const stranger = await createTestUser()

  // follower follows creator (one-way)
  await followUser(follower, creator)

  // mutual follow between mutualFollower and creator
  await followUser(mutualFollower, creator)
  await followUser(creator, mutualFollower)

  return { creator, follower, mutualFollower, stranger }
}
