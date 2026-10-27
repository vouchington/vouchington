import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import {
  changeTopicMergeClassifierCandidateTopic,
  getTopicMergeClassifierArtifacts,
  getTopicMergeClassifierConfiguration,
  seedTopicMergeClassifierCollision,
} from '@voucha/test-helpers/topic-merge-classifiers'
import {
  createTestTopic,
  createTestUser,
  insertTestImage,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { setTestTopicSurfaceImages } from '@voucha/test-helpers/entities/media-surface-writes'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  seedTopicMergeDeletedBookmarks,
  getTopicMergeLiveBookmarks,
  seedTopicMergeParentEdges,
  seedTopicMergeClaims,
  getTopicMergeClaims,
} from '@voucha/test-helpers/topic-merge-relations'
import {
  createTopicMergeParentTestOperation,
  deleteTopicMergeParentTestOperation,
  runTopicMergeParentTestPage,
} from '@voucha/test-helpers/entities/topic-merge-parent'
import { getTopicMergeRelations } from '@voucha/test-helpers/topic-merge-references'
import { seedTopicMergeLifetimeChain } from '@voucha/test-helpers/topic-merge-subtypes'
import { describe, expect, it } from 'vitest'
import { getTopicByAny } from './get.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import type { Topic } from './types.mts'
import { topicsWorkConfig } from './work-limits.mts'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('topic merge reference regressions', () => {
  it('records a live-feed conflict on the admitted operation before changing either topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    await Promise.all([
      insertTestRssFeedDirect({ topicId: source.id }),
      insertTestRssFeedDirect({ topicId: destination.id }),
    ])
    const operation = await createTopicMergeOperation(admin, source, destination)
    expect(operation.status).toBe('queued')
    let generation: number | null = 0
    for (let page = 0; page < 32 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, source.id, operation.id)).resolves.toMatchObject({
      status: 'failed',
      error_code: 'topic_merge_feed_conflict',
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
    await expect(getTopicByAny(destination.id)).resolves.toMatchObject({ id: destination.id })
  })

  it('merges a source with a logo while retaining its immutable image placement history', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const imageId = await insertTestImage(admin.id)
    await setTestTopicSurfaceImages(source.id, { logoImageId: imageId })
    await expect(mergeTopicAliases(admin, source, destination)).resolves.toMatchObject({
      destination_topic_id: destination.id,
    })
    await expect(getTestImageSurfacePlacements({ imageId, topicId: source.id })).resolves.toEqual([
      expect.objectContaining({ image_id: imageId, topic_id: source.id }),
    ])
  })

  it('retains live source follows and blocks over deleted destination bookmarks', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    await seedTopicMergeDeletedBookmarks(source.id, destination.id, admin.id)
    await mergeTopicAliases(admin, source, destination)
    await expect(
      getTopicMergeLiveBookmarks([source.id, destination.id], admin.id),
    ).resolves.toEqual([
      { kind: 'block', object_id: destination.id },
      { kind: 'follow', object_id: destination.id },
    ])
  })

  it('removes the direct parent edge when a child merges into its parent', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([[source.id, destination.id]])
    await mergeTopicAliases(admin, source, destination)
    await expect(
      getTopicMergeRelations(source.id, destination.id, admin.id),
    ).resolves.toMatchObject({ parents: [] })
  })

  it('rejects an indirect parent cycle before changing the source', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const intermediate = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [destination.id, intermediate.id],
      [intermediate.id, source.id],
    ])
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_parent_cycle',
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })

  it('rejects an ancestry walk that exceeds its configured depth', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const first = await createFullTestTopic({ user: admin })
    const second = await createFullTestTopic({ user: admin })
    const third = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [destination.id, first.id],
      [first.id, second.id],
      [second.id, third.id],
    ])
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      parent_merge_cycle_max_depth: 2,
    })
    try {
      await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
        status: 409,
        code: 'topic_merge_parent_cycle',
      })
    } finally {
      restore()
    }
  })

  it('rechecks an intermediate parent edge added after operation reservation', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const first = await createFullTestTopic({ user: admin })
    const second = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [destination.id, first.id],
      [second.id, source.id],
    ])
    const operationId = await createTopicMergeParentTestOperation(
      source.id,
      destination.id,
      admin.id,
    )
    try {
      await seedTopicMergeParentEdges([[first.id, second.id]])
      let errorCode: string | null = null
      for (let page = 0; page < 8 && errorCode === null; page++) {
        const result = await runTopicMergeParentTestPage(operationId, source.id, destination.id, 1)
        errorCode = result.errorCode
        if (!result.hasMore) break
      }
      expect(errorCode).toBe('topic_merge_parent_cycle')
      await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
    } finally {
      await deleteTopicMergeParentTestOperation(operationId)
    }
  })

  it.each([false, true])(
    'discards source classifier configuration and preserves only destination candidates collision=%s',
    async collision => {
      const fixture = await createClassifierFixture()
      const admin = await createTestUser({ administrator: true })
      const source = (await getTopicByAny(fixture.topicId))!
      const destination = await createFullTestTopic({ user: admin })
      await fixture.enableGlobalCandidateForCommunity()
      await fixture.createTopicBatch()
      const destinationCandidateId = collision
        ? await seedTopicMergeClassifierCollision(
            fixture.classifierId,
            destination.id,
            fixture.promptVersionId,
          )
        : null
      await mergeTopicAliases(admin, source, destination)
      await expect(
        getTopicMergeClassifierConfiguration([
          fixture.topicCandidateId,
          ...(destinationCandidateId ? [destinationCandidateId] : []),
        ]),
      ).resolves.toEqual(
        destinationCandidateId
          ? [
              {
                id: destinationCandidateId,
                topic_id: destination.id,
                thresholds: 1,
                overrides: 0,
                snapshots: 0,
              },
            ]
          : [],
      )
      await expect(getTopicMergeClassifierArtifacts(fixture.topicCandidateId)).resolves.toEqual({
        thresholds: 0,
        overrides: 0,
        snapshots: 0,
      })
    },
  )

  it('keeps classifier candidate topic identity immutable outside a merge', async () => {
    const fixture = await createClassifierFixture()
    const admin = await createTestUser({ administrator: true })
    const other = await createFullTestTopic({ user: admin })
    await expect(
      changeTopicMergeClassifierCandidateTopic(fixture.topicCandidateId, other.id),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('keeps a verified source claim over a pending destination claim', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    await seedTopicMergeClaims(source.id, destination.id, admin.id)
    await mergeTopicAliases(admin, source, destination)
    await expect(getTopicMergeClaims([source.id, destination.id], admin.id)).resolves.toEqual([
      { topic_id: destination.id, verified: true },
    ])
  })

  it('rejects a lifetime chain through the source before it reaches a unique violation', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin, topic_type: 'rewards_program_status' })
    const destination = await createFullTestTopic({
      user: admin,
      topic_type: 'rewards_program_status',
    })
    const owner = await createFullTestTopic({ user: admin, topic_type: 'rewards_program_status' })
    await seedTopicMergeLifetimeChain(source.id, destination.id, owner.id)
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_lifetime_version_conflict',
    })
  })
})
