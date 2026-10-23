import { describe, expect, it } from 'vitest'
import {
  createTestAgent,
  createTestUser,
  getPostClearanceChanges,
  getPostClearanceStatus,
  getTestAgentModerationTransparencyStamp,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
  insertTestTopic,
  setTestAgentDeletedAt,
} from '@voucha/test-helpers'
import {
  getTestModerationPassEvidence,
  getTestTopicContentProjection,
  getTestTopicRevisionIds,
  insertTestAgedCurrentPassEvidence,
  insertTestOldTopicContentRevision,
  insertTestTopicNonContentRevision,
} from '@voucha/test-helpers/entities/content-history'
import {
  getTestAgentModerationIds,
  getTestModerationVersionIds,
  insertTestOldSupersededModerationVersion,
} from '@voucha/test-helpers/entities/moderation-history'
import { checkPostClearance } from '@services/post-clearance/check-clearance'
import { cleanupContentHistory } from '../cleanup-content-history.mts'

describe('content history retention', () => {
  it('clears only aged private pass evidence and preserves the current decision', async () => {
    const owner = await createTestUser()
    const oldPostId = await insertTestPost({
      title: `retention-old-${crypto.randomUUID()}`,
      slug: `retention-old-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: owner.id,
      clearanceStatus: 'approved',
    })
    const youngPostId = await insertTestPost({
      title: `retention-young-${crypto.randomUUID()}`,
      slug: `retention-young-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: owner.id,
      clearanceStatus: 'approved',
    })
    const old = await insertTestAgedCurrentPassEvidence(
      oldPostId,
      new Date(Date.now() - 100 * 86_400_000),
    )
    const young = await insertTestAgedCurrentPassEvidence(
      youngPostId,
      new Date(Date.now() - 10 * 86_400_000),
    )
    const clearanceChangesBefore = await getPostClearanceChanges(oldPostId)

    await cleanupContentHistory({ batchSize: 1_000, maxBatches: 10 })
    await checkPostClearance(oldPostId)

    expect(await getTestModerationPassEvidence(old.versionId)).toEqual([
      { disposition: 'pass', evidence: {} },
      { disposition: 'pass', evidence: {} },
    ])
    expect(await getTestModerationPassEvidence(young.versionId)).toEqual([
      { disposition: 'pass', evidence: { provider_input: 'private' } },
      { disposition: 'pass', evidence: { raw_signal: 'private' } },
    ])
    expect(await getPostClearanceStatus(oldPostId)).toBe('approved')
    expect(await getPostClearanceChanges(oldPostId)).toEqual(clearanceChangesBefore)
  })

  it('removes only superseded old topic revisions while retaining live content attribution', async () => {
    const administrator = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `retained-topic-${crypto.randomUUID()}`,
      slug: `retained-topic-${crypto.randomUUID()}`,
      createdById: administrator.id,
    })
    const latestOnlyTopicId = await insertTestTopic({
      name: `latest-only-topic-${crypto.randomUUID()}`,
      slug: `latest-only-topic-${crypto.randomUUID()}`,
      createdById: administrator.id,
    })
    const occurredAt = new Date('2024-01-01T00:00:00.000Z')
    const oldId = await insertTestOldTopicContentRevision({
      topicId,
      revisedById: administrator.id,
      occurredAt,
    })
    const retainedLatestId = await insertTestOldTopicContentRevision({
      topicId: latestOnlyTopicId,
      revisedById: administrator.id,
      occurredAt,
    })
    const newerId = await insertTestTopicNonContentRevision(topicId, administrator.id)

    await cleanupContentHistory({ batchSize: 1_000, maxBatches: 10 })

    expect(await getTestTopicRevisionIds(topicId)).toEqual([newerId])
    expect(await getTestTopicRevisionIds(latestOnlyTopicId)).toEqual([retainedLatestId])
    expect(await getTestTopicContentProjection(topicId)).toEqual({
      content_updated_at: occurredAt,
      content_updated_by_id: administrator.id,
    })
    expect(oldId).not.toBe(newerId)
  })

  it('removes aged superseded moderation generations and their private evidence', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `superseded-version-${crypto.randomUUID()}`,
      slug: `superseded-version-${crypto.randomUUID()}`,
      markdown: 'current version survives',
      createdById: author.id,
    })
    const supersededId = await insertTestOldSupersededModerationVersion(
      postId,
      new Date(Date.now() - 120 * 86_400_000),
    )
    const current = await insertTestAgedCurrentPassEvidence(
      postId,
      new Date(Date.now() - 100 * 86_400_000),
    )

    await cleanupContentHistory({ batchSize: 1_000, maxBatches: 10 })

    expect(await getTestModerationVersionIds(postId)).toEqual([current.versionId])
    expect(await getTestModerationPassEvidence(supersededId)).toEqual([])
  })

  it('removes old superseded unpublished agent results but retains published transparency sources', async () => {
    const author = await createTestUser()
    const agent = await createTestAgent()
    const promptId = await insertTestAgentPrompt({ agentId: agent.id })
    const postId = await insertTestPost({
      title: `agent-history-${crypto.randomUUID()}`,
      slug: `agent-history-${crypto.randomUUID()}`,
      markdown: 'moderation history',
      createdById: author.id,
    })
    const oldAt = new Date('2024-05-01T12:00:00.000Z')
    await setTestAgentDeletedAt(agent.id, new Date('2024-04-01T00:00:00.000Z'))
    const unpublishedId = await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      occurredAt: oldAt,
      occurredAtSequence: 1,
    })
    await setTestAgentDeletedAt(agent.id, null)
    const publishedId = await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      occurredAt: oldAt,
      occurredAtSequence: 2,
    })
    const currentId = await insertTestAgentModeration({ postId, promptId, agentId: agent.id })
    expect(await getTestAgentModerationTransparencyStamp(unpublishedId)).toEqual({
      category: null,
      communityId: null,
    })
    expect(await getTestAgentModerationTransparencyStamp(publishedId)).toEqual({
      category: 'agent_moderation',
      communityId: null,
    })

    await cleanupContentHistory({ batchSize: 1_000, maxBatches: 10 })

    expect(await getTestAgentModerationIds(postId)).toEqual([publishedId, currentId])
  })
})
