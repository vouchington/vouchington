import { describe, expect, it } from 'vitest'
import {
  createTestAgent,
  createTestUser,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import { deleteUser } from '@services/users/delete'
import { getAgentModerationElectionVote } from './votes-get.mts'
import { upsertAgentModerationElectionVotes } from './votes-upsert.mts'

describe('latest agent moderation ballots', () => {
  it('compares each bulk vote with its latest ballot, including cleared histories', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const moderationIds: string[] = []
    for (const label of ['first', 'second', 'untouched']) {
      const suffix = crypto.randomUUID()
      const postId = await insertTestPost({
        title: `Latest ballot ${label} ${suffix}`,
        slug: `latest-ballot-${suffix}`,
        createdById: user.id,
        markdown: 'Latest ballot regression',
      })
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        flagged: false,
        results: { flagged: false },
      })
      const moderation = ((await getPostLLMModerations(postId)) as Array<{ id: string }>)[0]
      if (!moderation) throw new Error('Agent moderation ID not found')
      moderationIds.push(moderation.id)
    }
    const [first, second, untouched] = moderationIds as [string, string, string]
    expect(
      await upsertAgentModerationElectionVotes(user.id, [{ entityId: untouched, score: null }]),
    ).toEqual([])
    await upsertAgentModerationElectionVotes(user.id, [
      { entityId: first, score: 1 },
      { entityId: second, score: -1 },
    ])
    await upsertAgentModerationElectionVotes(user.id, [
      { entityId: first, score: -1 },
      { entityId: second, score: 1 },
    ])
    await upsertAgentModerationElectionVotes(otherUser.id, [
      { entityId: first, score: 1 },
      { entityId: second, score: -1 },
    ])
    expect(
      await upsertAgentModerationElectionVotes(user.id, [
        { entityId: first, score: -1 },
        { entityId: second, score: 1 },
      ]),
    ).toEqual([])
    const cleared = await upsertAgentModerationElectionVotes(user.id, [
      { entityId: first, score: null },
      { entityId: second, score: 1 },
    ])
    expect(cleared).toEqual([expect.objectContaining({ entity_id: first, score: null })])
    expect(
      await upsertAgentModerationElectionVotes(user.id, [
        { entityId: first, score: null },
        { entityId: second, score: 1 },
      ]),
    ).toEqual([])
    const restored = await upsertAgentModerationElectionVotes(user.id, [
      { entityId: first, score: 1 },
      { entityId: first, score: -1 },
      { entityId: second, score: null },
    ])
    expect(restored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_id: first, score: -1 }),
        expect.objectContaining({ entity_id: second, score: null }),
      ]),
    )
    expect(restored).toHaveLength(2)
  })

  it('writes no ballot for a deleted voter', async () => {
    const [author, voter] = await Promise.all([createTestUser(), createTestUser()])
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const suffix = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Deleted voter ${suffix}`,
      slug: `deleted-voter-${suffix}`,
      createdById: author.id,
      markdown: 'Deleted voter guard regression',
    })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false },
    })
    const moderation = ((await getPostLLMModerations(postId)) as Array<{ id: string }>)[0]
    if (!moderation) throw new Error('Agent moderation ID not found')
    await deleteUser(voter, voter)

    expect(
      await upsertAgentModerationElectionVotes(voter.id, [{ entityId: moderation.id, score: 1 }]),
    ).toEqual([])
    expect(await getAgentModerationElectionVote(voter.id, moderation.id)).toBeNull()
  })
})
