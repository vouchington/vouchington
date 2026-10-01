import { write } from '@data-stores/psql'
import { reserveClassifierRun } from '@services/classifier-runs'
import { updateRssFeedById } from '@services/rss-feeds'
import { evaluateRssFeedDiscoverability } from '@services/rss-feeds/evaluate-discoverability'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { STORY_CLUSTER_CANDIDATE_LIMIT } from '@voucha/config'
import {
  addRssFeedItemSource,
  deleteTestStory,
  insertTestStory,
  setRssFeedOwningTopicVoteScore,
  setTestItemStoryId,
  setTestItemStoryLocked,
} from '@voucha/test-helpers'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readStoryRunCandidates,
  requestStoryClusteringRun,
  type StoryClusteringItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { createStoryClusteringRunAdapter } from './adapter.mts'

const adapter = createStoryClusteringRunAdapter()
const DAY_MS = 24 * 60 * 60 * 1000

/** What a fresh receipt for the item captured, in the order the run asks, or why it settled. */
async function captured(item: StoryClusteringItem) {
  await requestStoryClusteringRun(item)
  const result = await reserveClassifierRun(adapter, item.subject)
  return result.kind === 'reserved' ? readStoryRunCandidates(result.run.runId) : result.kind
}

const standalone = (item: StoryClusteringItem) => ({ rssFeedItemId: item.itemId })

describe('story clustering candidate capture (real PG)', () => {
  it('asks about each nearby standalone item, nearest first, and no one farther than the threshold', async () => {
    const { unit, at, far } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const close = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.95) })
    const nearer = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.7) })
    await createStoryClusteringItem({ feedId: feed.id, embedding: far })
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    expect(await captured(item)).toEqual([standalone(close), standalone(nearer)])
  })

  it('asks about a story once however many of its members are near, and each story separately', async () => {
    const { unit, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const [first, second] = await Promise.all([insertTestStory(), insertTestStory()])
    const members = await Promise.all(
      [0.95, 0.93, 0.9].map(similarity =>
        createStoryClusteringItem({ feedId: feed.id, embedding: at(similarity) }),
      ),
    )
    await setTestItemStoryId(members[0]!.itemId, first.id)
    await setTestItemStoryId(members[1]!.itemId, first.id)
    await setTestItemStoryId(members[2]!.itemId, second.id)
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    expect(await captured(item)).toEqual([{ storyId: first.id }, { storyId: second.id }])
  })

  it('caps the question at the candidate limit, keeping the nearest', async () => {
    const { unit, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const similarities = Array.from(
      { length: STORY_CLUSTER_CANDIDATE_LIMIT + 2 },
      (_, i) => 0.99 - i * 0.02,
    )
    const neighbors = await Promise.all(
      similarities.map(similarity =>
        createStoryClusteringItem({ feedId: feed.id, embedding: at(similarity) }),
      ),
    )
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    expect(await captured(item)).toEqual(
      neighbors.slice(0, STORY_CLUSTER_CANDIDATE_LIMIT).map(standalone),
    )
  })

  it('settles as no work, with no model call to make, when nothing is near', async () => {
    const { unit, far } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    await createStoryClusteringItem({ feedId: feed.id, embedding: far })

    expect(
      await captured(await createStoryClusteringItem({ feedId: feed.id, embedding: unit })),
    ).toBe('no-work')
  })

  it('leaves out a neighbor published outside the clustering window', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const now = new Date()
    await createStoryClusteringItem({
      feedId: feed.id,
      embedding: near,
      publishedAt: new Date(now.getTime() - 40 * DAY_MS),
    })
    const item = await createStoryClusteringItem({
      feedId: feed.id,
      embedding: unit,
      publishedAt: now,
    })

    expect(await captured(item)).toBe('no-work')
  })

  it("measures a story's window from the story's own start, so a late member cannot extend it", async () => {
    const { unit, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const now = new Date()
    const story = await insertTestStory()
    await write(sql`/* setStoryPublishedAtForTest */
      UPDATE stories SET published_at = ${new Date(now.getTime() - 40 * DAY_MS)} WHERE id = ${story.id}`)
    const member = await createStoryClusteringItem({
      feedId: feed.id,
      embedding: at(0.95),
      publishedAt: now,
    })
    await setTestItemStoryId(member.itemId, story.id)
    const item = await createStoryClusteringItem({
      feedId: feed.id,
      embedding: unit,
      publishedAt: now,
    })

    expect(await captured(item)).toBe('no-work')
  })

  it('never asks about a story-locked or deleted-story neighbor', async () => {
    const { unit, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const locked = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.95) })
    await setTestItemStoryLocked(locked.itemId, true)
    const deleted = await insertTestStory()
    const member = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.9) })
    await setTestItemStoryId(member.itemId, deleted.id)
    await deleteTestStory(deleted.id)
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    expect(await captured(item)).toBe('no-work')
  })

  it('settles an item that is story-locked or already in a story as no work', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const locked = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await setTestItemStoryLocked(locked.itemId, true)
    const clustered = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await setTestItemStoryId(clustered.itemId, (await insertTestStory()).id)

    expect(await captured(locked)).toBe('no-work')
    expect(await captured(clustered)).toBe('no-work')
  })
})

describe('story clustering source discoverability (real PG)', () => {
  it('settles an item whose only source feed is hidden as no work, even with a near neighbor', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    await updateRssFeedById(feed.id, { discoverable: false })

    expect(await captured(item)).toBe('no-work')
  })

  it('settles an item whose feed fell below the topic score threshold as no work', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    await evaluateRssFeedDiscoverability(feed.id)

    expect(await captured(item)).toBe('no-work')
  })

  it('never asks about a neighbor whose every source feed is hidden', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const hidden = await createTestRssFeed({})
    await updateRssFeedById(hidden.id, { discoverable: false })
    await createStoryClusteringItem({ feedId: hidden.id, embedding: near })
    const visible = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: visible.id, embedding: unit })

    expect(await captured(item)).toBe('no-work')
  })

  it('keeps an item eligible, and a neighbor askable, while one source is still discoverable', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const hidden = await createTestRssFeed({})
    const visible = await createTestRssFeed({})
    await updateRssFeedById(hidden.id, { discoverable: false })
    const neighbor = await createStoryClusteringItem({ feedId: hidden.id, embedding: near })
    await addRssFeedItemSource(visible.id, neighbor.itemId)
    const item = await createStoryClusteringItem({ feedId: hidden.id, embedding: unit })
    await addRssFeedItemSource(visible.id, item.itemId)

    expect(await captured(item)).toEqual([standalone(neighbor)])
  })
})
