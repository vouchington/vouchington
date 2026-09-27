import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

// promptId is only { type: 'string' } in the generated contract. A non-UUID used to reach
// getCommunityAgentPrompt and PostgreSQL raised 22P02, which the API mapped to 500.
const malformedPromptRoutes = [
  {
    label: 'GET prompt',
    method: 'get' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid`,
  },
  {
    label: 'PATCH prompt',
    method: 'patch' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid`,
  },
  {
    label: 'DELETE prompt',
    method: 'delete' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid`,
  },
  {
    label: 'POST test-runs',
    method: 'post' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid/test-runs`,
  },
  {
    label: 'POST allocations',
    method: 'post' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid/allocations`,
  },
  {
    label: 'DELETE allocations',
    method: 'delete' as const,
    path: (slug: string) => `/api/v1/communities/${slug}/agent-prompts/not-a-uuid/allocations`,
  },
]

describe('community agent prompt id request validation', () => {
  it.each(malformedPromptRoutes)('$label returns 422 for an owner', async ({ method, path }) => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `prompt-id-422-${method}-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request[method](path(community.slug)).send({}).expect(422)
    expect(response.body.message).toMatch(/prompt ID/i)
  })

  it.each(malformedPromptRoutes)(
    '$label returns 401 when unauthenticated',
    async ({ method, path }) => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `prompt-id-401-${method}-${random}`,
      })

      const response = await createRequest()[method](path(community.slug)).send({}).expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    },
  )

  it('returns 403 for a member before rejecting a malformed prompt id on a moderated route', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `prompt-id-403-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(member!)
    await request.get(`/api/v1/communities/${community.slug}/agent-prompts/not-a-uuid`).expect(403)
    await request
      .post(`/api/v1/communities/${community.slug}/agent-prompts/not-a-uuid/test-runs`)
      .send({})
      .expect(403)
    await request
      .post(`/api/v1/communities/${community.slug}/agent-prompts/not-a-uuid/allocations`)
      .send({})
      .expect(403)
  })
})
