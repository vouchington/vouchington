import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { getPartitionRows } from '../../../test-helpers/data-stores/psql/election-schema.mts'
import { createPostClassifierApplicationFixture } from '../../../test-helpers/data-stores/psql/post-classifier/applications.mts'
import { onGracefulShutdown } from '../index.mts'

describe('post classifier application schema', () => {
  const fixtures: { dispose: () => Promise<unknown> }[] = []

  async function createFixture(
    ...options: Parameters<typeof createPostClassifierApplicationFixture>
  ) {
    const fixture = await createPostClassifierApplicationFixture(...options)
    fixtures.push(fixture)
    return fixture
  }

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('has one post-keyed RANGE parent and default child', async () => {
    expect(await getPartitionRows(['post_classifier_applications'])).toEqual([
      {
        table_name: 'post_classifier_applications',
        strategy: 'r',
        partition_key: 'RANGE (post_id)',
        child_name: 'post_classifier_applications__default',
        child_bound: 'DEFAULT',
      },
    ])
  })

  it('partitions by post and fences content, configuration, actor and provenance', async () => {
    const fixture = await createFixture({ community: true })
    expect((await fixture.read())?.community_id).toBe(fixture.communityId)
    await expect(fixture.duplicate()).rejects.toMatchObject({ code: '23505' })
    await expect(fixture.invalidConfigurationJson()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.wrongHash()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.mutateInputHash()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.mutateActor()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.mutateCommunity()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.setInvalidAttempts()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.deleteActor()).rejects.toMatchObject({ code: '23001' })
  })

  it('reserves a remote batch identity and accepts only its same-post C3 result', async () => {
    const matching = await createClassifierFixture()
    const matchingBatch = await matching.createTopicBatch()
    const fixture = await createFixture({
      postId: matching.postId,
      reservedBatchId: matchingBatch.batchId,
    })
    await expect(fixture.setInvalidCommittedBatch()).rejects.toMatchObject({ code: '23514' })
    await fixture.commitBatch(matchingBatch.batchId)
    expect((await fixture.read())?.committed_batch_id).toBe(matchingBatch.batchId)
    await fixture.persistRemoteOutcomes()
    await expect(fixture.injectLocalOutcome()).rejects.toMatchObject({ code: '23514' })

    const otherPost = await createFixture({
      remote: true,
      reservedBatchId: matchingBatch.batchId,
    })
    await expect(otherPost.commitBatch(matchingBatch.batchId)).rejects.toMatchObject({
      code: '23503',
    })

    const localOnly = await createFixture({
      postId: matching.postId,
    })
    await expect(localOnly.commitBatch(matchingBatch.batchId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      createFixture({
        postId: matching.postId,
        reservedBatchId: matchingBatch.batchId,
      }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(createFixture({ postId: matching.postId })).resolves.toMatchObject({
      reservedBatchId: null,
    })

    await fixture.markVotes()
    await fixture.markTags()
    await fixture.complete()
    await fixture.deletePost()
    expect(await fixture.read()).toBeUndefined()
  })

  it('bounds durable provider failure metadata without counting effect-only retries', async () => {
    const fixture = await createFixture({ remote: true })
    await expect(fixture.markTerminalFailure('unknown')).rejects.toMatchObject({ code: '23514' })
    await fixture.startProviderAttempt()
    expect((await fixture.read())?.provider_attempts_started).toBe(1)
    await expect(fixture.resetProviderAttempts()).rejects.toMatchObject({ code: '23514' })
    await fixture.markTerminalFailure('attempts-exhausted')
    await expect(fixture.clearTerminalFailure()).rejects.toMatchObject({ code: '23514' })
  })

  it('keeps terminal remote failure exclusive of committed results and effect phases', async () => {
    const classifier = await createClassifierFixture()
    const batch = await classifier.createTopicBatch()
    const fixture = await createFixture({
      postId: classifier.postId,
      reservedBatchId: batch.batchId,
    })
    await fixture.markTerminalFailure('attempts-exhausted')
    await expect(fixture.commitBatch(batch.batchId)).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.persistRemoteOutcomes()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.markVotes()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.complete()).rejects.toMatchObject({ code: '23514' })
  })

  it('cannot turn already-persisted remote outcomes into terminal failure', async () => {
    const classifier = await createClassifierFixture()
    const batch = await classifier.createTopicBatch()
    const fixture = await createFixture({
      postId: classifier.postId,
      reservedBatchId: batch.batchId,
    })
    await fixture.commitBatch(batch.batchId)
    await fixture.persistRemoteOutcomes()
    await expect(fixture.markTerminalFailure('attempts-exhausted')).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('requires outcomes, votes, and tags before completion, then clears the lease', async () => {
    const fixture = await createFixture()
    await expect(fixture.markVotes()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.persistPartialLocalOutcome()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.invalidLease()).rejects.toMatchObject({ code: '23514' })
    const token = randomUUID()
    await fixture.lease(token)
    await fixture.persistOutcomes()
    await expect(fixture.mutateLocalOutcome()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.markTags()).rejects.toMatchObject({ code: '23514' })
    await fixture.markVotes()
    await fixture.markTags()
    await fixture.complete()
    expect((await fixture.read())?.lease_token).toBeNull()
    await expect(fixture.clearVotes()).rejects.toMatchObject({ code: '23514' })
  })
})
