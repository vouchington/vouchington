import { createPostModerationContent } from '@services/posts/content'
import { SYSTEM_ENTITY_RELATION_VIEWER, getEntityRelations } from '@services/entity-relations'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import {
  getPostClearanceChanges,
  getPostClearanceStatus,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers/entities/post-clearance'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimPostClassifierApplication } from './application-claim.mts'
import { completePostClassifierApplication } from './application-completion.mts'
import { persistPostClassifierOutcomes } from './application-outcomes.mts'
import { resolvePostClassifierConfiguration } from './configuration.mts'

describe('post classifier completion and approval admission (real PG)', () => {
  let release: (() => Promise<void>) | undefined

  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })

  afterAll(async () => release?.())

  it('rejects an unapproved current post before it creates a receipt', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const inputSha256 = createPostModerationContent(post).content_sha256
    await setPostClassifierPostHashForTest(post.id, inputSha256)
    await setTestPostClearanceStatus(post.id, 'pending')
    const resolved = await resolvePostClassifierConfiguration(null, {
      detectorPackageVersion: 'test-package-completion-0.1.0',
    })
    if (!resolved) throw new Error('Expected local post classifier configuration')

    await expect(
      claimPostClassifierApplication({
        postId: post.id,
        inputSha256,
        resolved,
        detectorPackageVersion: 'test-package-completion-0.1.0',
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ kind: 'stale' })
    await expect(getPostClassifierApplicationFacts(post.id)).resolves.toEqual([])
  })

  it('atomically applies missing effects and completes without altering approval history', async () => {
    const fixture = await createPostClassifierExecutionFixture(false, true)
    const local = fixture.lease.resolved.configuration.local
    if (!local) throw new Error('Expected local post classifier configuration')
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        localOutcome: {
          flagged: true,
          reason: 'AI-generated',
          confidenceScore: 0.98,
          confidenceThreshold: local.confidenceThreshold,
          classification: 'ai',
          detector: 'test-detector',
          detectorModelVersion: 'test-model',
        },
      }),
    ).resolves.toBe('persisted')
    const history = await getPostClearanceChanges(fixture.post.id)

    await expect(completePostClassifierApplication(fixture.lease)).resolves.toEqual({
      kind: 'completed',
      appliedTopicIds: [],
      taggedTopicIds: [local.topicId],
    })
    await expect(getPostClearanceStatus(fixture.post.id)).resolves.toBe('approved')
    await expect(getPostClearanceChanges(fixture.post.id)).resolves.toEqual(history)
    await expect(getPostClassifierApplicationFacts(fixture.post.id)).resolves.toMatchObject([
      {
        lease_token: null,
        votes_applied_at: expect.any(Date),
        tags_applied_at: expect.any(Date),
        completed_at: expect.any(Date),
      },
    ])
    await expect(
      getEntityRelations('post', fixture.post.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
        readOnly: false,
      }),
    ).resolves.toContainEqual(expect.objectContaining({ object_id: local.topicId }))

    await expect(completePostClassifierApplication(fixture.lease)).resolves.toEqual({
      kind: 'replay',
      appliedTopicIds: [],
      taggedTopicIds: [],
    })
    await setTestPostClearanceStatus(fixture.post.id, 'pending')
    await expect(completePostClassifierApplication(fixture.lease)).resolves.toEqual({
      kind: 'replay',
      appliedTopicIds: [],
      taggedTopicIds: [],
    })
  })

  it('completes a remote C4 vote and its matching topic tag in one receipt', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    const remote = fixture.lease.resolved.configuration.remote
    const question = remote?.questions[0]
    if (!remote || !question || !fixture.lease.decisionBatchId) {
      throw new Error('Expected remote post classifier configuration')
    }
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        remoteDecision: {
          batchId: fixture.lease.decisionBatchId,
          classifierId: remote.classifierId,
          promptVersionId: remote.promptVersionId,
          scope: { scopeCategory: 'global', scopeCommunityId: null },
          subject: { postId: fixture.post.id, rssFeedItemId: null },
          calls: [
            {
              shardOrdinal: 0,
              results: [
                {
                  candidateKind: 'topic',
                  topicId: question.topicId,
                  storedCandidateId: question.candidateId,
                  probability: (question.upper + 1) / 2,
                  rawResponse: { type: 'noul', probability: (question.upper + 1) / 2 },
                },
              ],
            },
          ],
        },
      }),
    ).resolves.toBe('persisted')

    await expect(completePostClassifierApplication(fixture.lease)).resolves.toEqual({
      kind: 'completed',
      appliedTopicIds: [question.topicId],
      taggedTopicIds: [question.topicId],
    })
    const relation = (
      await getEntityRelations('post', fixture.post.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
        readOnly: false,
      })
    ).find(candidate => candidate.object_id === question.topicId)
    if (!relation?.id) throw new Error('Expected remote post classifier topic relation')
    await expect(
      getEntityRelationElectionVote(fixture.lease.resolved.configuration.actorId, relation.id),
    ).resolves.toMatchObject({ choice: 'confirm' })
  })

  it('does not apply effects after the post loses current-revision approval', async () => {
    const fixture = await createPostClassifierExecutionFixture(false, true)
    const local = fixture.lease.resolved.configuration.local
    if (!local) throw new Error('Expected local post classifier configuration')
    await persistPostClassifierOutcomes({
      lease: fixture.lease,
      localOutcome: {
        flagged: true,
        reason: 'AI-generated',
        confidenceScore: 0.98,
        confidenceThreshold: local.confidenceThreshold,
        classification: 'ai',
        detector: 'test-detector',
        detectorModelVersion: 'test-model',
      },
    })
    await setTestPostClearanceStatus(fixture.post.id, 'pending')

    await expect(completePostClassifierApplication(fixture.lease)).resolves.toEqual({
      kind: 'stale',
      appliedTopicIds: [],
      taggedTopicIds: [],
    })
    await expect(getPostClassifierApplicationFacts(fixture.post.id)).resolves.toMatchObject([
      { votes_applied_at: null, tags_applied_at: null },
    ])
  })
})
