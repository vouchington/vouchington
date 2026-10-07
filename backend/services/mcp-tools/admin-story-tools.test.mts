import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import {
  createTestUserDirect,
  insertTestStory,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { getStoryItemIds } from '@services/stories'
import {
  addEditorialStoryItem,
  removeEditorialStoryItem,
  setEditorialStoryOfficialItem,
  renameEditorialStory,
} from '@services/stories/admin-management'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const invoke = (
  admin: Awaited<ReturnType<typeof createTestUserDirect>>,
  name: string,
  args: unknown,
) =>
  callMcpTool(
    name,
    args,
    { ...admin, membership_plan: null },
    ['editorial:read', 'editorial:write'],
    ADMIN_MCP_SERVER_CONFIG,
  )

describe('shared editorial story operations', () => {
  it.each(['add', 'remove', 'official'] as const)(
    'rolls back %s and its staff history together',
    async operation => {
      const admin = await createTestUserDirect({ administrator: true })
      const story = await insertTestStory({ title: 'Before' })
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
      if (operation !== 'add') await setTestItemStoryId(itemId, story.id)
      const before = await getStoryItemIds(story.id)
      await withRejectedStaffActionHistory(async query => {
        const mutation =
          operation === 'add'
            ? addEditorialStoryItem
            : operation === 'remove'
              ? removeEditorialStoryItem
              : setEditorialStoryOfficialItem
        await expect(mutation(admin, story.id, itemId, { query })).rejects.toThrow(
          'staff history rejected for test',
        )
      })
      expect(await getStoryItemIds(story.id)).toEqual(before)
      expect((await getStoryById(story.id))?.official_rss_feed_item_id).toBeNull()
      expect(await readStaffActionHistory(admin.id)).toEqual([])
    },
  )

  it('records each registered item/official mutation and its exact story changes', async () => {
    const admin = await createTestUserDirect({ administrator: true })
    const story = await insertTestStory({ title: 'Before' })
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
    expect(
      (await invoke(admin, 'add_story_item', { story_id: story.id, item_id: itemId })).isError,
    ).not.toBe(true)
    expect(await getStoryItemIds(story.id)).toContain(itemId)
    expect(
      (await invoke(admin, 'set_story_official_item', { story_id: story.id, item_id: itemId }))
        .isError,
    ).not.toBe(true)
    expect((await getStoryById(story.id))?.official_rss_feed_item_id).toBe(itemId)
    expect(
      (await invoke(admin, 'remove_story_item', { story_id: story.id, item_id: itemId })).isError,
    ).not.toBe(true)
    expect(await getStoryItemIds(story.id)).not.toContain(itemId)
    expect((await getStoryById(story.id))?.official_rss_feed_item_id).toBeNull()
    expect((await getStoryById(story.id))?.official_locked_at).not.toBeNull()
    expect((await readStaffActionHistory(admin.id)).map(row => row.action_type)).toEqual([
      'story_item_add',
      'story_official_item_set',
      'story_item_remove',
    ])
  })
  it.each(['add_story_item', 'remove_story_item', 'set_story_official_item', 'rename_story'])(
    'rejects %s on an unknown story without history',
    async name => {
      const admin = await createTestUserDirect({ administrator: true })
      const args =
        name === 'rename_story'
          ? { story_id: randomUUID(), title: 'After' }
          : { story_id: randomUUID(), item_id: randomUUID() }
      expect((await invoke(admin, name, args)).isError).toBe(true)
      expect(await readStaffActionHistory(admin.id)).toEqual([])
    },
  )

  it('rolls back the story rename when staff history fails', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const story = await insertTestStory({ title: 'Before' })
    await withRejectedStaffActionHistory(async query => {
      await expect(renameEditorialStory(user, story.id, 'After', { query })).rejects.toThrow(
        'staff history rejected for test',
      )
    })
    expect((await getStoryById(story.id))?.title).toBe('Before')
    expect(await readStaffActionHistory(user.id)).toEqual([])
  })
  it('invokes the registered rename tool with actor history and wrapped authored output', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const story = await insertTestStory({ title: 'Before' })
    const result = await invoke(user, 'rename_story', { story_id: story.id, title: ' After ' })
    expect(result.isError).not.toBe(true)
    expect((await getStoryById(story.id))?.title).toBe('After')
    expect(await readStaffActionHistory(user.id)).toMatchObject([
      { action_type: 'story_rename', metadata: { story_id: story.id, title: 'After' } },
    ])
    expect(JSON.stringify(result)).toContain('After')
  })
  it('rejects a nonstaff actor and unknown landing-page target without history', async () => {
    const user = await createTestUserDirect()
    const story = await insertTestStory({ title: 'Before' })
    await expect(renameEditorialStory(user, story.id, 'After')).rejects.toMatchObject({
      status: 403,
    })
    const admin = await createTestUserDirect({ administrator: true })
    const result = await invoke(admin, 'list_user_landing_pages', { user_id: randomUUID() })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('404')
    expect(await readStaffActionHistory(user.id)).toEqual([])
  })
})
