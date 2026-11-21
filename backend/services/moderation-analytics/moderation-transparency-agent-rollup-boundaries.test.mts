import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  getTestAgentModerationTransparencyStamp,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPost,
  setTestAgentDeletedHalfMillisecondAfter,
  setTestCommunityAgentPromptDeletedHalfMillisecondAfter,
  setTestModerationPromptDeletedHalfMillisecondAfter,
} from '@voucha/test-helpers'

describe('moderation transparency agent rollup boundaries', () => {
  it('fails closed when an agent, prompt, or CAP is deleted in the event millisecond', async () => {
    const eventAt = await uniqueTransparencyNow()
    const [owner, author] = await Promise.all([createTestUser(), createTestUser()])
    for (const setDeletedAt of [
      (prompt: { id: string; agent_id: string }) =>
        setTestAgentDeletedHalfMillisecondAfter(prompt.agent_id, eventAt),
      (prompt: { id: string; agent_id: string }) =>
        setTestModerationPromptDeletedHalfMillisecondAfter(prompt.id, eventAt),
      (prompt: { id: string; agent_id: string }) =>
        setTestCommunityAgentPromptDeletedHalfMillisecondAfter(prompt.id, eventAt),
    ]) {
      const community = await insertTestCommunity({ createdById: owner.id })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      await setDeletedAt(prompt)
      const moderationId = await insertTestAgentModeration({
        postId: await insertBoundaryPost(community.id, author.id),
        promptId: prompt.id,
        agentId: prompt.agent_id,
        occurredAt: eventAt,
      })
      await expect(getTestAgentModerationTransparencyStamp(moderationId)).resolves.toMatchObject({
        category: null,
        communityId: null,
      })
    }
  })
})

async function insertBoundaryPost(communityId: string, authorId: string): Promise<string> {
  const suffix = crypto.randomUUID()
  return insertTestPost({
    title: `Transparency boundary ${suffix}`,
    slug: `transparency-boundary-${suffix}`,
    createdById: authorId,
    markdown: 'Test moderation transparency boundary.',
    communityId,
  })
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
