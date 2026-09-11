import { it, expect, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { createApplication } from './create.mts'
import { getPendingApplicationForUser, getPendingApplicationCommunityIds } from './pending.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('pending applications', () => {
  let owner: PrivateUser
  let privateCommunity: Community

  beforeAll(async () => {
    owner = await createTestUser()
    privateCommunity = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
  })

  describe('getPendingApplicationForUser', () => {
    it('returns null when no application exists', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      const result = await getPendingApplicationForUser(community.id, user.id)
      expect(result).toBeNull()
    })

    it('returns the application after creating one', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      await createApplication(user.id, community.id, {})

      const result = await getPendingApplicationForUser(community.id, user.id)
      expect(result).not.toBeNull()
      expect(result!.user_id).toBe(user.id)
      expect(result!.community_id).toBe(community.id)
      expect(result!.approved_at).toBeNull()
      expect(result!.rejected_at).toBeNull()
    })

    it('returns null for a different community', async () => {
      const user = await createTestUser()
      const community1 = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const community2 = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      await createApplication(user.id, community1.id, {})

      const result = await getPendingApplicationForUser(community2.id, user.id)
      expect(result).toBeNull()
    })
  })

  describe('getPendingApplicationCommunityIds', () => {
    it('returns empty set for no applications', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      const result = await getPendingApplicationCommunityIds(user.id, [community.id])
      expect(result.size).toBe(0)
    })

    it('returns empty set for empty communityIds array', async () => {
      const user = await createTestUser()

      const result = await getPendingApplicationCommunityIds(user.id, [])
      expect(result.size).toBe(0)
    })

    it('returns the community ID after creating an application', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      await createApplication(user.id, community.id, {})

      const result = await getPendingApplicationCommunityIds(user.id, [community.id])
      expect(result.has(community.id)).toBe(true)
    })

    it('returns only matching community IDs', async () => {
      const user = await createTestUser()
      const communityWith = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })
      const communityWithout = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })

      await createApplication(user.id, communityWith.id, {})

      const result = await getPendingApplicationCommunityIds(user.id, [
        communityWith.id,
        communityWithout.id,
      ])
      expect(result.has(communityWith.id)).toBe(true)
      expect(result.has(communityWithout.id)).toBe(false)
    })

    it('does not return a community ID for an unrelated user', async () => {
      const applicant = await createTestUser()
      const otherUser = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      await createApplication(applicant.id, community.id, {})

      const result = await getPendingApplicationCommunityIds(otherUser.id, [community.id])
      expect(result.size).toBe(0)
    })

    it('stores and retrieves application message', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
      const expectedMessage = 'I would love to join this community!'

      await createApplication(user.id, community.id, {}, expectedMessage)

      const application = await getPendingApplicationForUser(community.id, user.id)
      expect(application).not.toBeNull()
      const { message: applicationMessage } = application!
      expect(applicationMessage).toBe(expectedMessage)
    })

    it('stores null message when not provided', async () => {
      const user = await createTestUser()
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })

      await createApplication(user.id, community.id, {})

      const application = await getPendingApplicationForUser(community.id, user.id)
      expect(application).not.toBeNull()
      const { message: applicationMessage } = application!
      expect(applicationMessage).toBeNull()
    })
  })

  describe('ignored setup community', () => {
    it('privateCommunity is usable as shared fixture', () => {
      expect(privateCommunity.visibility).toBe('private')
    })
  })
})
