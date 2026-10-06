import { randomUUID, createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestStory,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
  withTestStoryLifecycleLock,
} from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import {
  getStoryItemIds,
  addEditorialStoryItem,
  removeEditorialStoryItem,
  setEditorialStoryOfficialItem,
} from '@services/stories'
import * as storyLifecycleLock from '../post-publication/story-lifecycle-lock.mts'

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

describe('editorial official-item membership serialization', () => {
  it('serializes a blocked official setter and removal, clearing the reference and retaining its admin lock', async () => {
    const { admin, story, itemId } = await fixture()
    let select: ReturnType<typeof setEditorialStoryOfficialItem>
    let remove: ReturnType<typeof removeEditorialStoryItem>
    const itemLocked = Promise.withResolvers<void>()
    const lockStoryLifecycles = storyLifecycleLock.lockStoryLifecycles
    vi.spyOn(storyLifecycleLock, 'lockStoryLifecycles').mockImplementation((query, storyIds) => {
      itemLocked.resolve()
      return lockStoryLifecycles(query, storyIds)
    })
    try {
      await withTestStoryLifecycleLock(story.id, async () => {
        select = setEditorialStoryOfficialItem(admin, story.id, itemId)
        await itemLocked.promise
        await expect(probeItemRow(itemId)).rejects.toMatchObject({ code: '55P03' })
        remove = removeEditorialStoryItem(admin, story.id, itemId)
      })
    } finally {
      vi.restoreAllMocks()
    }
    await Promise.all([select!, remove!])
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

async function probeItemRow(itemId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await query(
    `SELECT id FROM rss_feed_items WHERE id = $1::uuid AND deleted_at IS NULL FOR UPDATE`,
    [itemId],
  )
  await query.commit()
}
