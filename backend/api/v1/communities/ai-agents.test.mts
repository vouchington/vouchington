import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'

describe('Community AI Agents Routes', () => {
  describe('GET /api/v1/communities/:slug/ai-agents', () => {
    it('returns 401 for unauthenticated', async () => {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ai-agents-get-401-${createRandomString(8)}`,
      })

      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/ai-agents`).expect(401)
    })

    it('returns 403 for regular members', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ai-agents-get-403-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(member!)
      await request.get(`/api/v1/communities/${community.slug}/ai-agents`).expect(403)
    })

    it('returns the agent matrix for moderators', async () => {
      const [owner, mod] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ai-agents-get-mod-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: mod!.id,
        role: 'moderator',
      })

      const request = createRequest()
      await request.authenticateAs(mod!)
      const res = await request.get(`/api/v1/communities/${community.slug}/ai-agents`).expect(200)

      expect(res.body.community_ai_agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'self-promotion',
            system_username: 'self-promotion',
            label_topic_slugs: ['self-promotion'],
            enabled: false,
          }),
        ]),
      )
    })
  })

  describe('PUT/DELETE /api/v1/communities/:slug/ai-agents/:agentSlug', () => {
    it('enables and disables an agent for owners', async () => {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ai-agents-toggle-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      const enabled = await request
        .put(`/api/v1/communities/${community.slug}/ai-agents/self-promotion`)
        .expect(200)
      expect(enabled.body.community_ai_agent.enabled).toBe(true)

      const disabled = await request
        .delete(`/api/v1/communities/${community.slug}/ai-agents/self-promotion`)
        .expect(200)
      expect(disabled.body.community_ai_agent.enabled).toBe(false)
    })

    it('returns 404 for unknown agent slugs', async () => {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ai-agents-unknown-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      await request.put(`/api/v1/communities/${community.slug}/ai-agents/not-real`).expect(404)
    })
  })
})
