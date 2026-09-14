import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestAgent,
  createTestUser,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

async function createModerationElection(postCreator: PrivateUser) {
  const random = Math.random().toString(36).slice(2, 10)
  const agent = await createTestAgent({
    agentType: 'moderator',
    activated: true,
    slug: `agent-moderation-votes-pagination-${random}`,
  })
  const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
  const postId = await insertTestPost({
    title: `Agent moderation votes pagination ${random}`,
    slug: `agent-moderation-votes-pagination-${random}`,
    createdById: postCreator.id,
    markdown: 'Agent moderation votes pagination markdown',
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

  return moderationId
}

describe('GET /api/v1/agent-moderations/:id/votes pagination', () => {
  it('returns empty results with null cursors for a moderation with no votes', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderationId = await createModerationElection(admin)
    const req = createRequest()
    await req.authenticateAs(admin)

    const res = await req.get(`/api/v1/agent-moderations/${moderationId}/votes`).expect(200)
    expect(res.body.results).toEqual([])
    expect(res.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('paginates across multiple admin voters without duplicates or gaps', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderationId = await createModerationElection(admin)
    const voterA = await createTestUser({ administrator: true })
    const voterB = await createTestUser({ administrator: true })
    const voterC = await createTestUser({ administrator: true })

    const req = createRequest()
    for (const voter of [voterA, voterB, voterC]) {
      await req.authenticateAs(voter)
      await req
        .put(`/api/v1/agent-moderations/${moderationId}/vote`)
        .send({ choice: 'accurate' })
        .expect(204)
    }

    await req.authenticateAs(admin)
    const page1 = await req
      .get(`/api/v1/agent-moderations/${moderationId}/votes?limit=2`)
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req
      .get(`/api/v1/agent-moderations/${moderationId}/votes?limit=2&after=${cursor}`)
      .expect(200)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info.has_next_page).toBe(false)
    expect(page2.body.page_info.end_cursor).toBeNull()

    const seenUserIds = new Set(
      [...page1.body.results, ...page2.body.results].map((v: { user_id: string }) => v.user_id),
    )
    expect(seenUserIds).toEqual(new Set([voterA.id, voterB.id, voterC.id]))
  })

  it('rejects a malformed cursor with 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderationId = await createModerationElection(admin)
    const req = createRequest()
    await req.authenticateAs(admin)

    await req
      .get(`/api/v1/agent-moderations/${moderationId}/votes?after=not-a-real-cursor`)
      .expect(400)
  })

  it('rejects a cursor minted for another moderation with 400 (cross-resource replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderationA = await createModerationElection(admin)
    const moderationB = await createModerationElection(admin)
    const voter = await createTestUser({ administrator: true })

    const req = createRequest()
    await req.authenticateAs(voter)
    await req
      .put(`/api/v1/agent-moderations/${moderationA}/vote`)
      .send({ choice: 'accurate' })
      .expect(204)

    await req.authenticateAs(admin)
    const pageA = await req
      .get(`/api/v1/agent-moderations/${moderationA}/votes?limit=1`)
      .expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    await req
      .get(`/api/v1/agent-moderations/${moderationB}/votes?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })

  it('rejects a cursor minted for a different endpoint with 400 (cross-endpoint replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderationId = await createModerationElection(admin)
    const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

    const req = createRequest()
    await req.authenticateAs(admin)
    await req
      .get(
        `/api/v1/agent-moderations/${moderationId}/votes?after=${encodeURIComponent(wrongScope)}`,
      )
      .expect(400)
  })

  it('returns 403 for authenticated non-admin users', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const moderationId = await createModerationElection(admin)
    const req = createRequest()
    await req.authenticateAs(user)

    await req.get(`/api/v1/agent-moderations/${moderationId}/votes`).expect(403)
  })
})
