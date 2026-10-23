import { rethrowTopicMergeError } from './merge-preflight.mts'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import {
  changeTopicMergeClassifierCandidateTopic,
  getTopicMergeClassifierArtifacts,
  getTopicMergeClassifierConfiguration,
  seedTopicMergeClassifierCollision,
} from '@voucha/test-helpers/topic-merge-classifiers'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestImage,
} from '@voucha/test-helpers'
import { setTestTopicSurfaceImages } from '@voucha/test-helpers/entities/media-surface-writes'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import { withHeldTopicMergeTopicRow } from '@voucha/test-helpers/topic-merge-self-relations'
import {
  seedTopicMergeDeletedBookmarks,
  getTopicMergeLiveBookmarks,
  seedTopicMergeParentEdges,
  seedTopicMergeClaims,
  getTopicMergeClaims,
  lockTestTopicMergeAncestorRow,
  seedTopicMergeParentEdgeInTransaction,
} from '@voucha/test-helpers/topic-merge-relations'
import { getTopicMergeRelations } from '@voucha/test-helpers/topic-merge-references'
import { seedTopicMergeLifetimeChain } from '@voucha/test-helpers/topic-merge-subtypes'
import { describe, expect, it } from 'vitest'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import type { Topic } from './types.mts'
import { topicsWorkConfig } from './work-limits.mts'
async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('topic merge reference regressions', () => {
  it('maps a restored-feed unique conflict to a stable 409 and preserves other failures', () => {
    const conflict = Object.assign(new Error('restored feed collision'), {
      code: '23505',
      constraint: 'idx_rss_feeds__topic_id__unique',
    })
    expect(() => rethrowTopicMergeError(conflict)).toThrow(
      expect.objectContaining({ status: 409, code: 'topic_merge_feed_conflict', cause: conflict }),
    )
    const other = Object.assign(new Error('different constraint'), {
      code: '23505',
      constraint: 'other_unique',
    })
    expect(() => rethrowTopicMergeError(other)).toThrow(other)
    expect(() => rethrowTopicMergeError(new Error('preflight failed'))).toThrow('preflight failed')
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

  it('rechecks an intermediate parent edge committed after preflight', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const first = await createFullTestTopic({ user: admin })
    const second = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [destination.id, first.id],
      [second.id, source.id],
    ])
    let outcome: Promise<{ value: unknown } | { error: unknown }> | undefined
    await withHeldTopicMergeTopicRow(destination.id, async holderProcessId => {
      outcome = mergeTopicAliases(admin, source, destination).then(
        value => ({ value }),
        err => ({ error: err }),
      )
      await waitForTestPostgresLockWaiter(holderProcessId, 'mergeTopicAliases lockTopics')
      await seedTopicMergeParentEdges([[first.id, second.id]])
    })
    await expect(outcome).resolves.toMatchObject({
      error: { status: 409, code: 'topic_merge_parent_cycle' },
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })

  it('serializes a new parent edge through a locked ancestor before the final check', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const first = await createFullTestTopic({ user: admin })
    const second = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [destination.id, first.id],
      [second.id, source.id],
    ])
    let outcome: Promise<{ value: unknown } | { error: unknown }> | undefined
    {
      await using writer = await beginTransaction()
      const writerProcessId = await lockTestTopicMergeAncestorRow(writer, first.id)
      outcome = mergeTopicAliases(admin, source, destination).then(
        value => ({ value }),
        err => ({ error: err }),
      )
      await waitForTestPostgresLockWaiter(writerProcessId, 'lockTopicMergeParentAncestors')
      await seedTopicMergeParentEdgeInTransaction(writer, first.id, second.id)
      await writer.commit()
    }
    await expect(outcome).resolves.toMatchObject({
      error: { status: 409, code: 'topic_merge_parent_cycle' },
    })
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
