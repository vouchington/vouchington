import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import {
  insertRunCandidateForTest as insertCandidate,
  insertStoryFamilyResultForTest,
} from '../../../test-helpers/data-stores/psql/classifier-runs/story-clustering-storage-inserts.mts'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readStoryRunCandidates,
  reserveStoryClusteringRun,
} from '../../../test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture.mts'
import { createTestRssFeedWithTiming } from '../../../test-helpers/entities/test-entities.mts'
import { onGracefulShutdown } from '../index.mts'

describe('story-clustering result storage', () => {
  it('scores a standalone RSS item candidate in the story result family, once per decision', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()
    const second = await fixture.createAdditionalCall(lineage.batchId, 1)
    const item = { storyId: null, rssFeedItemId: fixture.rssFeedItemId, stored: false }

    await expect(insertStoryFamilyResultForTest(fixture, lineage, item)).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(
      insertStoryFamilyResultForTest(fixture, { ...lineage, callId: second }, item),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('stores a story candidate and a standalone item candidate side by side in one decision', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()

    await insertStoryFamilyResultForTest(fixture, lineage, {
      storyId: fixture.storyId,
      rssFeedItemId: null,
      stored: true,
    })
    await expect(
      insertStoryFamilyResultForTest(fixture, lineage, {
        storyId: null,
        rssFeedItemId: fixture.rssFeedItemId,
        stored: false,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('rejects a result that scores both kinds of candidate, or neither', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()

    await expect(
      insertStoryFamilyResultForTest(fixture, lineage, {
        storyId: fixture.storyId,
        rssFeedItemId: fixture.rssFeedItemId,
        stored: false,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertStoryFamilyResultForTest(fixture, lineage, {
        storyId: null,
        rssFeedItemId: null,
        stored: false,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a stored candidate configuration on a standalone item result', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()

    await expect(
      insertStoryFamilyResultForTest(fixture, lineage, {
        storyId: null,
        rssFeedItemId: fixture.rssFeedItemId,
        stored: true,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

describe('story-clustering run candidate storage', () => {
  // The last describe in the file, so the pool outlives every test above.
  afterAll(async () => {
    await onGracefulShutdown()
  })

  async function reservedRun() {
    const { unit, near } = makeStoryClusteringVectors()
    const fixture = await createClassifierFixture()
    const feedId = await createTestRssFeedWithTiming(fixture.communityTopicId)
    const neighbor = await createStoryClusteringItem({ feedId, embedding: near })
    const incoming = await createStoryClusteringItem({ feedId, embedding: unit })
    const run = await reserveStoryClusteringRun(incoming)
    return { run, neighbor, incoming, fixture }
  }

  it('captures a standalone item candidate once, in order, with its own foreign key', async () => {
    const { run, neighbor, incoming } = await reservedRun()

    expect(await readStoryRunCandidates(run.runId)).toEqual([{ rssFeedItemId: neighbor.itemId }])
    await expect(
      insertCandidate(run.runId, { story: null, item: neighbor.itemId }, 7),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertCandidate(run.runId, { story: null, item: incoming.itemId }, 0),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects a captured candidate that names more than one kind of entity, or none', async () => {
    const { run, neighbor, fixture } = await reservedRun()

    await expect(
      insertCandidate(run.runId, { story: fixture.storyId, item: neighbor.itemId }, 5),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(insertCandidate(run.runId, { story: null, item: null }, 5)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      insertCandidate(run.runId, { story: fixture.storyId, item: null, topic: fixture.topicId }, 5),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts one story candidate per run and refuses the same story twice', async () => {
    const { run, fixture } = await reservedRun()

    await expect(
      insertCandidate(run.runId, { story: fixture.storyId, item: null }, 5),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      insertCandidate(run.runId, { story: fixture.storyId, item: null }, 6),
    ).rejects.toMatchObject({ code: '23505' })
  })
})
