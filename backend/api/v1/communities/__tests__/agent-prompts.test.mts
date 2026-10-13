import { describe, it, expect, vi } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  createRandomString,
  createTestMembership,
} from '@voucha/test-helpers'

describe('Community Agent Prompts Routes', () => {
  describe('GET /api/v1/communities/:slug/agent-prompts', () => {
    it('returns 401 for unauthenticated', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-get-401-${random}`,
      })

      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/agent-prompts`).expect(401)
    })

    it('returns 403 for regular member', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ap-get-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(member!)
      await request.get(`/api/v1/communities/${community.slug}/agent-prompts`).expect(403)
    })

    it('returns prompts list for owner', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-get-owner-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const res = await request
        .get(`/api/v1/communities/${community.slug}/agent-prompts`)
        .expect(200)

      expect(Array.isArray(res.body.community_agent_prompts)).toBe(true)
      expect(res.body.slot_info).toHaveProperty('used')
      expect(res.body.slot_info).toHaveProperty('limit')
    })

    it('returns prompts for moderator', async () => {
      const [owner, mod] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ap-get-mod-${random}`,
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

      const request = createRequest()
      await request.authenticateAs(mod!)
      const res = await request
        .get(`/api/v1/communities/${community.slug}/agent-prompts`)
        .expect(200)
      expect(Array.isArray(res.body.community_agent_prompts)).toBe(true)
    })
  })

  describe('POST /api/v1/communities/:slug/agent-prompts', () => {
    it('returns 401 for unauthenticated', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-post-401-${random}`,
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts`)
        .set('Content-Type', 'application/json')
        .send({ prompt: 'Test' })
        .expect(401)
    })

    it('creates a prompt as owner', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-post-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const res = await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts`)
        .set('Content-Type', 'application/json')
        .send({ prompt: 'You are a moderation agent. Flag inappropriate posts.' })
        .expect(201)

      expect(res.body.community_agent_prompt).toHaveProperty('id')
      expect(res.body.community_agent_prompt.is_slot_allocated).toBe(false)
    })

    it('creates the prompt without repeating the prompt annotation', async () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv('VITEST_DIAGNOSTICS', '1')

      try {
        const user = await createTestUser()
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `ap-post-query-profile-${createRandomString(8)}`,
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          role: 'owner',
        })

        const request = createRequest()
        await request.authenticateAs(user)
        const res = await request
          .post(`/api/v1/communities/${community.slug}/agent-prompts`)
          .set('Content-Type', 'application/json')
          .send({ prompt: 'Flag spam content' })
          .expect(201)

        expect(res.body.community_agent_prompt).toHaveProperty('id')
        const profileLines = stderr.mock.calls
          .map(([chunk]) => String(chunk))
          .filter(line => line.includes('route=POST /api/v1/communities/'))
          .filter(line => line.includes('/agent-prompts '))
        expect(profileLines).toHaveLength(1)
        expect(profileLines[0]).not.toContain('createCommunityAgentPrompt')
      } finally {
        stderr.mockRestore()
        vi.unstubAllEnvs()
      }
    })

    it('returns 422 when prompt is missing', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-post-422-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })
  })

  describe('GET /api/v1/communities/:slug/agent-prompts/:promptId', () => {
    it('returns single prompt for owner', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-get-one-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const res = await request
        .get(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}`)
        .expect(200)

      expect(res.body.community_agent_prompt.id).toBe(prompt.id)
    })
  })

  describe('POST /api/v1/communities/:slug/agent-prompts/:promptId/test-runs', () => {
    it('validates prompt test run body fields before moderation', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `ap-test-run-validation-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/test-runs`)
        .set('Content-Type', 'application/json')
        .send({ text: 123, save_for_training: true, expected_flagged: false })
        .expect(422)
      await request
        .post(`/api/v1/communities/${community.slug}/agent-prompts/${prompt.id}/test-runs`)
        .set('Content-Type', 'application/json')
        .send({ text: 'sample', expected_flagged: 'yes' })
        .expect(422)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestMembership)
})
