import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeedPostClassifierSQL from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import {
  SYSTEM_ENTITY_RELATION_VIEWER,
  getEntityRelations,
  upsertEntityRelation,
} from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { notifications } from '@queues/notifications/queues'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { acquirePostClassifierSeedTestLock } from '@voucha/test-helpers/data-stores/psql/post-classifier/seed-lock'
import {
  expirePostClassifierLeaseForTest,
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runClassifierBorrowedTestTransaction } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import { moderationConfig } from '@services/moderation/config'
import { claimPostClassifierApplication } from './application-claim.mts'
import { applyPostClassifierTags } from './application-tags.mts'
import { persistPostClassifierOutcomes } from './application-outcomes.mts'
import { applyPostClassifierVotes } from './application-votes.mts'
import { resolvePostClassifierConfiguration } from './configuration.mts'

const detectorPackageVersion = 'test-package-tags-version'

async function fixture(options: { remote: boolean; local: boolean }) {
  const author = await createTestUser()
  const community = options.remote ? await insertTestCommunity({ createdById: author.id }) : null
  if (community) {
    await setPostClassifierToggleForTest(community.id, 'click-bait', true)
    if (!options.local) await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
  }
  const post = await createTestPost({ user: author, community_id: community?.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  const resolved = await resolvePostClassifierConfiguration(community?.id ?? null, {
    detectorPackageVersion,
  })
  if (!resolved) throw new Error('Expected post classifier configuration')
  const claim = await claimPostClassifierApplication({
    postId: post.id,
    inputSha256,
    resolved,
    detectorPackageVersion,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
  return { author, community, post, inputSha256, resolved, claim }
}

function localOutcome(flagged: boolean, confidenceThreshold: number) {
  return {
    flagged,
    reason: flagged ? 'AI-generated' : 'Human-authored',
    confidenceScore: flagged ? 0.98 : 0.01,
    confidenceThreshold,
    classification: flagged ? ('ai' as const) : ('human' as const),
    detector: 'test-detector',
    detectorModelVersion: 'test-model',
  }
}

function remoteDecision(setup: Awaited<ReturnType<typeof fixture>>, positive: boolean) {
  const remote = setup.claim.resolved.configuration.remote
  if (!remote || !setup.claim.decisionBatchId) return null
  return {
    batchId: setup.claim.decisionBatchId,
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    subject: { postId: setup.post.id, rssFeedItemId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: remote.questions.map(question => ({
          candidateKind: 'topic' as const,
          topicId: question.topicId,
          storedCandidateId: question.candidateId,
          probability: positive ? (question.upper + 1) / 2 : question.lower / 2,
          rawResponse: { type: 'noul', positive },
        })),
      },
    ],
  }
}

async function persistAndVote(
  setup: Awaited<ReturnType<typeof fixture>>,
  options: { localFlagged: boolean; remotePositive: boolean },
): Promise<void> {
  const local = setup.claim.resolved.configuration.local
  expect(
    await persistPostClassifierOutcomes({
      lease: setup.claim,
      localOutcome: local
        ? localOutcome(options.localFlagged, local.confidenceThreshold)
        : undefined,
      remoteDecision: remoteDecision(setup, options.remotePositive) ?? undefined,
    }),
  ).toBe('persisted')
  await applyPostClassifierVotes(setup.claim)
}

async function categoryRelations(postId: string) {
  return getEntityRelations('post', postId, 'category', 'topic', {
    viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    readOnly: false,
  })
}

function hasPostNotification(
  jobs: Awaited<ReturnType<typeof notifications.getJobs>>,
  postId: string,
): boolean {
  return jobs.some(
    job =>
      job.name === 'processReconcilePostNotifications' &&
      (job.data as { postId: string }).postId === postId,
  )
}

describe('post classifier tag receipts (real PG)', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = (await acquirePostClassifierSeedTestLock()).release
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeedPostClassifierSQL(), undefined)
  })
  afterAll(async () => releaseSeedLock?.())

  it('atomically writes local, remote, and mixed positive tags with the durable marker', async () => {
    const local = await fixture({ remote: false, local: true })
    await persistAndVote(local, { localFlagged: true, remotePositive: false })
    expect(await applyPostClassifierTags(local.claim)).toEqual({
      taggedTopicIds: [local.claim.resolved.configuration.local!.topicId],
    })

    const remote = await fixture({ remote: true, local: false })
    await persistAndVote(remote, { localFlagged: false, remotePositive: true })
    const remoteTopicId = remote.claim.resolved.configuration.remote!.questions[0]!.topicId
    expect(await applyPostClassifierTags(remote.claim)).toEqual({
      taggedTopicIds: [remoteTopicId],
    })

    const mixed = await fixture({ remote: true, local: true })
    await persistAndVote(mixed, { localFlagged: true, remotePositive: true })
    const mixedTopicIds = [
      mixed.claim.resolved.configuration.local!.topicId,
      mixed.claim.resolved.configuration.remote!.questions[0]!.topicId,
    ].toSorted()
    expect(await applyPostClassifierTags(mixed.claim)).toEqual({
      taggedTopicIds: mixedTopicIds,
    })
    expect(
      (await categoryRelations(mixed.post.id)).map(relation => relation.object_id).toSorted(),
    ).toEqual(mixedTopicIds)
    expect(await getPostClassifierApplicationFacts(mixed.post.id)).toMatchObject([
      { tags_applied_at: expect.any(Date) },
    ])
  })

  it('marks no-positive outcomes complete without creating relations', async () => {
    const setup = await fixture({ remote: true, local: true })
    await persistAndVote(setup, { localFlagged: false, remotePositive: false })
    expect(await applyPostClassifierTags(setup.claim)).toEqual({ taggedTopicIds: [] })
    expect(await categoryRelations(setup.post.id)).toEqual([])
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { tags_applied_at: expect.any(Date) },
    ])
  })

  it('rolls back relations and the marker with its borrowed transaction', async () => {
    const setup = await fixture({ remote: true, local: true })
    await persistAndVote(setup, { localFlagged: true, remotePositive: true })
    await expect(
      runClassifierBorrowedTestTransaction(async query => {
        await applyPostClassifierTags(setup.claim, { query })
        expect(
          hasPostNotification(
            await waitForQueueJobs(
              notifications,
              waiting => hasPostNotification(waiting, setup.post.id),
              200,
            ),
            setup.post.id,
          ),
        ).toBe(false)
        throw new Error('rollback tags')
      }),
    ).rejects.toThrow('rollback tags')
    expect(
      hasPostNotification(
        await waitForQueueJobs(
          notifications,
          waiting => hasPostNotification(waiting, setup.post.id),
          200,
        ),
        setup.post.id,
      ),
    ).toBe(false)
    expect(await categoryRelations(setup.post.id)).toEqual([])
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { tags_applied_at: null },
    ])
  })

  it('replays without duplicating relations and attributes shared-actor tags correctly', async () => {
    const first = await fixture({ remote: true, local: false })
    const second = await fixture({ remote: true, local: false })
    await persistAndVote(first, { localFlagged: false, remotePositive: true })
    await persistAndVote(second, { localFlagged: false, remotePositive: true })
    const human = await createTestUser()
    const topicId = first.claim.resolved.configuration.remote!.questions[0]!.topicId
    await upsertEntityRelation(
      human,
      getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'topic',
        predicate: 'category',
      }),
      first.post,
      [{ id: topicId }],
      { vote: true },
    )
    await applyPostClassifierTags(first.claim)
    await applyPostClassifierTags(second.claim)
    expect(await applyPostClassifierTags(first.claim)).toEqual({ taggedTopicIds: [] })
    const firstRelations = await categoryRelations(first.post.id)
    const secondRelations = await categoryRelations(second.post.id)
    expect(firstRelations).toHaveLength(1)
    expect(secondRelations).toHaveLength(1)
    expect(firstRelations[0]?.created_by_id).toBe(human.id)
    expect(secondRelations[0]?.created_by_id).toBe(first.resolved.configuration.actorId)
    const firstRelationId = firstRelations[0]?.id
    if (!firstRelationId) throw new Error('Expected tagged relation ID')
    await expect(getEntityRelationElectionVote(human.id, firstRelationId)).resolves.toMatchObject({
      choice: 'confirm',
    })
    await expect(
      getEntityRelationElectionVote(first.resolved.configuration.actorId, firstRelationId),
    ).resolves.toMatchObject({ choice: 'confirm' })
  })

  it('rejects missing prerequisites and stale lease or configuration without marking tags', async () => {
    const missing = await fixture({ remote: false, local: true })
    await expect(applyPostClassifierTags(missing.claim)).rejects.toThrow('outcomes must persist')
    const local = missing.claim.resolved.configuration.local!
    await persistPostClassifierOutcomes({
      lease: missing.claim,
      localOutcome: localOutcome(true, local.confidenceThreshold),
    })
    await expect(applyPostClassifierTags(missing.claim)).rejects.toThrow('votes must apply')

    const expired = await fixture({ remote: false, local: true })
    await persistAndVote(expired, { localFlagged: true, remotePositive: false })
    await expirePostClassifierLeaseForTest(expired.post.id, expired.claim.applicationId)
    await expect(applyPostClassifierTags(expired.claim)).rejects.toThrow('lease is not current')

    const staleContent = await fixture({ remote: false, local: true })
    await persistAndVote(staleContent, { localFlagged: true, remotePositive: false })
    await setPostClassifierPostHashForTest(staleContent.post.id, Buffer.alloc(32, 9))
    await expect(applyPostClassifierTags(staleContent.claim)).rejects.toThrow('became stale')
    expect(await categoryRelations(staleContent.post.id)).toEqual([])
    expect(await getPostClassifierApplicationFacts(staleContent.post.id)).toMatchObject([
      { tags_applied_at: null },
    ])

    const staleConfiguration = await fixture({ remote: true, local: false })
    await persistAndVote(staleConfiguration, { localFlagged: false, remotePositive: true })
    await setPostClassifierToggleForTest(staleConfiguration.community!.id, 'click-bait', false)
    await expect(applyPostClassifierTags(staleConfiguration.claim)).rejects.toThrow('became stale')
    expect(await getPostClassifierApplicationFacts(staleConfiguration.post.id)).toMatchObject([
      { tags_applied_at: null },
    ])
  })
})
