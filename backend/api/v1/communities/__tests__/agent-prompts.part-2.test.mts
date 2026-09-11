import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  createRandomString,
  createTestMembership,
  removeTestCommunityMember,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'

describe('Community Agent Prompts Routes', () => {
  describe('PATCH /api/v1/communities/:slug/agent-prompts/:promptId', () => {
    it('updates prompt text as creator', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-patch-ok-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const res = await request
        .patch(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .set('Content-Type', 'application/json')
        .send({ prompt: 'Updated moderation prompt text.' })
        .expect(200)

      expect(res.body.community_agent_prompt.prompt).toBe('Updated moderation prompt text.')
    })

    it('returns 403 for non-creator moderator', async () => {
      const [owner, mod] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ap-patch-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: mod!.id,
        role: 'moderator',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner!.id,
      })

      const request = createRequest()
      await request.authenticateAs(mod!)
      await request
        .patch(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .set('Content-Type', 'application/json')
        .send({ prompt: 'Hacked prompt' })
        .expect(403)
    })

    it('rejects a removed former owner who created the prompt', async () => {
      const [formerOwner, nextOwner] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: formerOwner!.id,
        slug: `ap-patch-former-owner-${createRandomString(8)}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: formerOwner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: nextOwner!.id,
          role: 'moderator',
        }),
      ])
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: formerOwner!.id,
      })
      await updateTestCommunityMemberRole(community.id, formerOwner!.id, 'member')
      await updateTestCommunityMemberRole(community.id, nextOwner!.id, 'owner')
      await removeTestCommunityMember(community.id, formerOwner!.id)

      const request = createRequest()
      await request.authenticateAs(formerOwner!)
      await request
        .patch(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .send({ prompt: 'Former owner update' })
        .expect(403)
    })
  })

  describe('DELETE /api/v1/communities/:slug/agent-prompts/:promptId', () => {
    it('soft-deletes prompt as creator', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-del-ok-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .expect(204)
    })

    it('returns 403 for non-creator non-owner moderator', async () => {
      const [owner, mod, mod2] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ap-del-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: mod!.id,
        role: 'moderator',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: mod2!.id,
        role: 'moderator',
      })
      // mod creates a prompt
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: mod!.id,
      })

      // mod2 (a different moderator) tries to delete it — should fail
      const request = createRequest()
      await request.authenticateAs(mod2!)
      await request
        .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .expect(403)
    })

    it('rejects a removed former owner who created the prompt', async () => {
      const [formerOwner, nextOwner] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: formerOwner!.id,
        slug: `ap-del-former-owner-${createRandomString(8)}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: formerOwner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: nextOwner!.id,
          role: 'moderator',
        }),
      ])
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: formerOwner!.id,
      })
      await updateTestCommunityMemberRole(community.id, formerOwner!.id, 'member')
      await updateTestCommunityMemberRole(community.id, nextOwner!.id, 'owner')
      await removeTestCommunityMember(community.id, formerOwner!.id)

      const request = createRequest()
      await request.authenticateAs(formerOwner!)
      await request
        .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .expect(403)
    })
  })

  describe('POST /api/v1/communities/:slug/agent-prompts/:promptId/allocations', () => {
    it('returns 403 for user without membership', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-alloc-403-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/allocations`)
        .expect(403)
    })

    it('allocates slot for user with plus membership', async () => {
      const user = await createTestUser()
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-alloc-204-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/allocations`)
        .expect(204)
    }, 30_000)
  })

  describe('DELETE /api/v1/communities/:slug/agent-prompts/:promptId/allocations', () => {
    it('returns 422 if slot not allocated', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-dealloc-422-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/allocations`)
        .expect(422)
    })

    it('deallocates an allocated slot', async () => {
      const user = await createTestUser()
      await createTestMembership({ user_id: user.id, plan: 'plus' })
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-dealloc-204-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      // First allocate
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/allocations`)
        .expect(204)
      // Then deallocate
      await request
        .delete(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/allocations`)
        .expect(204)
    }, 30_000)
  })
})
