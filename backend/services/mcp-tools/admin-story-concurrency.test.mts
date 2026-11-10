import { randomUUID, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestStory,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import {
  getStoryItemIds,
  addEditorialStoryItem,
  removeEditorialStoryItem,
  setEditorialStoryOfficialItem,
} from '@services/stories'

async function fixture() {
  const admin = await createTestUserDirect({ administrator: true })
  const story = await insertTestStory({ title: randomUUID() })
  const feed = await insertTestRssFeedDirect({})
  const guid = randomUUID()
  const itemData = { title: guid, link: `https://example.com/${guid}` }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: await createTestUrlWithHostname(),
    guid,
    itemData,
    contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
  })
  await setTestItemStoryId(itemId, story.id)
  return { admin, story, itemId }
}

describe('editorial official-item membership', () => {
  it('clears the official reference when the item is removed after it is set', async () => {
    const { admin, story, itemId } = await fixture()
    await setEditorialStoryOfficialItem(admin, story.id, itemId)
    await removeEditorialStoryItem(admin, story.id, itemId)
    const final = await getStoryById(story.id)
    expect(final?.official_rss_feed_item_id).toBeNull()
    expect(final?.official_locked_at).not.toBeNull()
    expect(await getStoryItemIds(story.id)).not.toContain(itemId)
    expect((await readStaffActionHistory(admin.id)).map(row => row.action_type)).toEqual([
      'story_official_item_set',
      'story_item_remove',
    ])
    await expect(setEditorialStoryOfficialItem(admin, story.id, itemId)).rejects.toMatchObject({
      status: 400,
    })
    expect(await readStaffActionHistory(admin.id)).toHaveLength(2)
  })
  it('clears an old official reference on reassignment without unlocking the former story', async () => {
    const { admin, story, itemId } = await fixture()
    await setEditorialStoryOfficialItem(admin, story.id, itemId)
    const before = await getStoryById(story.id)
    const next = await insertTestStory({ title: randomUUID() })
    await addEditorialStoryItem(admin, next.id, itemId)
    const after = await getStoryById(story.id)
    expect(after?.official_rss_feed_item_id).toBeNull()
    expect(after?.official_locked_at).toEqual(before?.official_locked_at)
    expect(await getStoryItemIds(story.id)).not.toContain(itemId)
    expect(await getStoryItemIds(next.id)).toContain(itemId)
    expect(await readStaffActionHistory(admin.id)).toMatchObject([
      { action_type: 'story_official_item_set' },
      {
        action_type: 'story_item_add',
        metadata: { story_id: next.id, prior_story_id: story.id, rss_feed_item_id: itemId },
      },
    ])
  })
})
