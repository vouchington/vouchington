import type { StoryRunCandidate } from '@services/classifier-runs'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { deleteTestStory, insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import {
  setStoryPublishedAtForTest,
  softDeleteRssFeedItemForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { describe, expect, it } from 'vitest'
import { readStoryClusteringRepresentatives } from './representatives.mts'

const PUBLISHED = new Date('2026-03-04T05:06:07.000Z')

async function setup() {
  const { unit, at } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const incoming = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
  const story = await insertTestStory()
  await setStoryPublishedAtForTest(story.id, PUBLISHED)
  const member = (similarity: number) =>
    createStoryClusteringItem({ feedId: feed.id, embedding: at(similarity) }).then(async item => {
      await setTestItemStoryId(item.itemId, story.id)
      return item
    })
  return { feed, incoming, story, member, at }
}

const asStory = (storyId: string): StoryRunCandidate => ({ kind: 'story', storyId })

describe('readStoryClusteringRepresentatives (real PG)', () => {
  it("stands the story's nearest live member in for the story, whatever its other members", async () => {
    const { incoming, story, member } = await setup()
    await member(0.7)
    const nearest = await member(0.95)
    await member(0.8)

    const [representative] = await readStoryClusteringRepresentatives(incoming.subject, [
      asStory(story.id),
    ])

    expect(representative).toEqual({
      candidate: asStory(story.id),
      rssFeedItemId: nearest.itemId,
      storyPublishedAt: PUBLISHED,
    })
  })

  it('moves on to the next nearest member when the nearest one is deleted after capture', async () => {
    const { incoming, story, member } = await setup()
    const nearest = await member(0.95)
    const next = await member(0.8)
    await softDeleteRssFeedItemForTest(nearest.itemId)

    const [representative] = await readStoryClusteringRepresentatives(incoming.subject, [
      asStory(story.id),
    ])

    expect(representative!.rssFeedItemId).toBe(next.itemId)
  })

  it('still describes a story that lost every member, by the story alone', async () => {
    const { incoming, story, member } = await setup()
    await softDeleteRssFeedItemForTest((await member(0.9)).itemId)

    const [representative] = await readStoryClusteringRepresentatives(incoming.subject, [
      asStory(story.id),
    ])

    expect(representative).toEqual({
      candidate: asStory(story.id),
      rssFeedItemId: null,
      storyPublishedAt: PUBLISHED,
    })
  })

  it('still reports a deleted story, with nothing to describe it by', async () => {
    const { incoming, story, member } = await setup()
    await member(0.9)
    await deleteTestStory(story.id)

    const [representative] = await readStoryClusteringRepresentatives(incoming.subject, [
      asStory(story.id),
    ])

    expect(representative).toEqual({
      candidate: asStory(story.id),
      rssFeedItemId: null,
      storyPublishedAt: null,
    })
  })

  it('keeps every candidate in capture order, passing a standalone item through as itself', async () => {
    const { feed, incoming, story, member, at } = await setup()
    const nearest = await member(0.9)
    const standalone = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.99) })
    const candidates: StoryRunCandidate[] = [
      { kind: 'rss_feed_item', rssFeedItemId: standalone.itemId },
      asStory(story.id),
    ]

    const representatives = await readStoryClusteringRepresentatives(incoming.subject, candidates)

    expect(representatives).toEqual([
      { candidate: candidates[0], rssFeedItemId: standalone.itemId, storyPublishedAt: null },
      { candidate: candidates[1], rssFeedItemId: nearest.itemId, storyPublishedAt: PUBLISHED },
    ])
  })

  it('answers an empty capture with no representatives', async () => {
    const { incoming } = await setup()

    await expect(readStoryClusteringRepresentatives(incoming.subject, [])).resolves.toEqual([])
  })

  it('refuses a subject that is not an RSS feed item', async () => {
    await expect(
      readStoryClusteringRepresentatives({ postId: 'post-id', rssFeedItemId: null }, []),
    ).rejects.toThrow('require an RSS feed item subject')
  })
})
