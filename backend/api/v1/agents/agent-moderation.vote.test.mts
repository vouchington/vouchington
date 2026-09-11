import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestAgent,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  getLatestTestModerationTrainingFeedback,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('agent-moderation.vote', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
  })

  describe('Agent Moderation Vote Routes', () => {
    async function createModerationElection() {
      const random = Math.random().toString(36).slice(2, 10)
      const agent = await createTestAgent({
        agentType: 'moderator',
        activated: true,
        slug: `agent-moderation-vote-${random}`,
      })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      const postId = await insertTestPost({
        title: `Agent moderation vote ${random}`,
        slug: `agent-moderation-vote-${random}`,
        createdById: user.id,
        markdown: 'Agent moderation vote markdown',
      })
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        results: { flagged: false, reason: 'Looks clean' },
        flagged: false,
      })

      const moderations = (await getPostLLMModerations(postId)) as Array<{ id: string }>
      const moderationId = moderations[0]?.id
      if (!moderationId) {
        throw new Error('Missing agent moderation ID')
      }

      return { moderationId, postId }
    }

    describe('PUT /api/v1/agent-moderations/:id/vote', () => {
      it('allows admins to vote on an agent moderation', async () => {
        const { moderationId, postId } = await createModerationElection()

        const request = createRequest()
        await request.authenticateAs(admin)

        await request
          .put(`/api/v1/agent-moderations/${moderationId}/vote`)
          .send({ choice: 'accurate' })
          .expect(204)
        await expect(
          getLatestTestModerationTrainingFeedback({
            postId,
            sourceType: 'agent_moderation_vote',
            humanAction: 'accuracy_upvote',
          }),
        ).resolves.toMatchObject({ label: 'true_negative' })
      })

      it('records accuracy_unvote training feedback when an admin clears a vote', async () => {
        const { moderationId, postId } = await createModerationElection()
        const request = createRequest()
        await request.authenticateAs(admin)

        await request
          .put(`/api/v1/agent-moderations/${moderationId}/vote`)
          .send({ choice: 'accurate' })
          .expect(204)
        await request.delete(`/api/v1/agent-moderations/${moderationId}/vote`).expect(204)

        await expect(
          getLatestTestModerationTrainingFeedback({
            postId,
            sourceType: 'agent_moderation_vote',
            humanAction: 'accuracy_unvote',
          }),
        ).resolves.toMatchObject({ metadata: { score: null } })
      })

      it('returns 403 for authenticated non-admin users', async () => {
        const { moderationId } = await createModerationElection()

        const request = createRequest()
        await request.authenticateAs(user)

        await request
          .put(`/api/v1/agent-moderations/${moderationId}/vote`)
          .send({ choice: 'accurate' })
          .expect(403)
      })
    })

    it('records prompt moderation votes against the prompt community', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `agent-moderation-vote-community-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
        slotAllocated: true,
        onFlagAction: 'unpublish',
      })
      const postId = await insertTestPost({
        title: `Prompt moderation vote ${random}`,
        slug: `prompt-moderation-vote-${random}`,
        createdById: user.id,
        markdown: 'Prompt moderation vote markdown',
      })
      await insertTestAgentModeration({
        postId,
        promptId: prompt.id,
        agentId: prompt.agent_id,
        results: { flagged: true, reason: 'Community prompt flagged this' },
        flagged: true,
      })
      const moderations = (await getPostLLMModerations(postId)) as Array<{ id: string }>
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .put(`/api/v1/agent-moderations/${moderations[0]!.id}/vote`)
        .send({ choice: 'accurate' })
        .expect(204)
      await expect(
        getLatestTestModerationTrainingFeedback({
          postId,
          sourceType: 'agent_moderation_vote',
          humanAction: 'accuracy_upvote',
        }),
      ).resolves.toMatchObject({ community_id: community.id, label: 'true_positive' })
    })

    describe('GET /api/v1/agent-moderations/:id/votes', () => {
      it('returns votes for admins', async () => {
        const { moderationId } = await createModerationElection()
        const request = createRequest()
        await request.authenticateAs(admin)

        await request
          .put(`/api/v1/agent-moderations/${moderationId}/vote`)
          .send({ choice: 'inaccurate' })
          .expect(204)

        const response = await request
          .get(`/api/v1/agent-moderations/${moderationId}/votes`)
          .expect(200)

        expect(response.body.results).toHaveLength(1)
        expect(response.body.results[0]).toMatchObject({
          entity_id: moderationId,
          user_id: admin.id,
          choice: 'inaccurate',
        })
      })

      it('returns 403 for authenticated non-admin users', async () => {
        const { moderationId } = await createModerationElection()
        const request = createRequest()
        await request.authenticateAs(user)

        await request.get(`/api/v1/agent-moderations/${moderationId}/votes`).expect(403)
      })
    })
  })
})
