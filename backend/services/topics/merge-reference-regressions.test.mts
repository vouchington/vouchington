import { insertParentAcrossTopicMerge } from '@voucha/test-helpers/topic-merge-parent-race'
import { createTestTopic, createTestUser, insertTestImage } from '@voucha/test-helpers'
import { setTestTopicSurfaceImages } from '@voucha/test-helpers/entities/media-surface-writes'
import {
  seedTopicMergeDeletedBookmarks,
  getTopicMergeLiveBookmarks,
  seedTopicMergeParentEdges,
  seedTopicMergeClaims,
  getTopicMergeClaims,
} from '@voucha/test-helpers/topic-merge-relations'
import { getTopicMergeRelations } from '@voucha/test-helpers/topic-merge-references'
import { seedTopicMergeLifetimeChain } from '@voucha/test-helpers/topic-merge-subtypes'
import { describe, expect, it } from 'vitest'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import type { Topic } from './types.mts'
async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('topic merge reference regressions', () => {
  it('merges a source with a logo while retaining its immutable image placement history', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const imageId = await insertTestImage(admin.id)
    await setTestTopicSurfaceImages(source.id, { logoImageId: imageId })
    await expect(mergeTopicAliases(admin, source, destination)).resolves.toMatchObject({
      destination_topic_id: destination.id,
    })
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

  it('revalidates a parent writer that validated before a merge committed', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const first = await createFullTestTopic({ user: admin })
    const second = await createFullTestTopic({ user: admin })
    await seedTopicMergeParentEdges([
      [source.id, first.id],
      [second.id, destination.id],
    ])
    await expect(
      insertParentAcrossTopicMerge(admin, first.id, second.id, () =>
        mergeTopicAliases(admin, source, destination),
      ),
    ).rejects.toMatchObject({ status: 422 })
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
