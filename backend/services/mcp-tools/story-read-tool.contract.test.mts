import { createTestUser } from '@voucha/test-helpers'
import { deleteTestStory, insertTestStory } from '@voucha/test-helpers/entities/stories'
import {
  createTestStoryMembers,
  setTestStoryMemberSourceState,
} from '@voucha/test-helpers/entities/story-member-pages'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

type Caller = PrivateUser & { membership_plan: null }
type StoryResult = {
  success: boolean
  error?: string
  story?: Record<string, unknown>
  items?: Array<Record<string, unknown>>
  page_info?: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

// Every call goes through the real call path, which checks the result against the output schema.
async function call(caller: Caller, args: Record<string, unknown>) {
  const result = await callMcpTool(
    'get_story',
    args,
    caller,
    ['posts:read'],
    USER_MCP_SERVER_CONFIG,
  )
  expect(result.isError).toBeUndefined()
  const [block] = result.content as [{ type: 'text'; text: string }]
  expect(result.structuredContent).toEqual(JSON.parse(block.text))
  return result.structuredContent as StoryResult
}

function itemIds(result: StoryResult) {
  return result.items?.map(item => item['id'])
}

describe('get_story — real DB', () => {
  let caller: Caller

  beforeAll(async () => {
    caller = { ...(await createTestUser()), membership_plan: null }
  })

  it('returns the story with its newest articles as wrapped external content', async () => {
    const { story, feed, itemIds: expected } = await createTestStoryMembers(3)

    const result = await call(caller, { story_id: story.id })

    expect(result.success).toBe(true)
    expect(result.story).toMatchObject({
      id: story.id,
      title: 'Bounded story members',
      official_rss_feed_item_id: null,
    })
    expect(result.story).not.toHaveProperty('official_locked_at')
    expect(result.story).not.toHaveProperty('deleted_at')
    expect(itemIds(result)).toEqual(expected)
    expect(result.items?.[0]).toMatchObject({ title: 'Story member', rss_feed_id: feed.id })
    expect(result.items?.[0]?.['markdown']).toContain('Related article.')
    expect(result.items?.[0]?.['markdown']).toContain('external-content')
    expect(result.items?.[0]?.['url']).toEqual(expect.stringMatching(/^https?:\/\//))
    expect(result.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('walks the articles with round-tripped cursors', async () => {
    const { story, itemIds: expected } = await createTestStoryMembers(3)

    const first = await call(caller, { story_id: story.id, limit: 2 })
    const second = await call(caller, {
      story_id: story.id,
      limit: 2,
      after: first.page_info?.end_cursor,
    })

    expect(first.page_info?.has_next_page).toBe(true)
    expect([...(itemIds(first) ?? []), ...(itemIds(second) ?? [])]).toEqual(expected)
    expect(second.page_info?.has_next_page).toBe(false)
  })

  it('leaves out the excluded article', async () => {
    const { story, itemIds: expected } = await createTestStoryMembers(3)

    const result = await call(caller, { story_id: story.id, exclude_item_id: expected[0] })

    expect(itemIds(result)).toEqual(expected.slice(1))
  })

  it('returns a story with no visible articles and a story with no title', async () => {
    const empty = await insertTestStory()
    const { story, feed } = await createTestStoryMembers(2)
    await setTestStoryMemberSourceState(feed.id, 'deleted')

    expect(await call(caller, { story_id: empty.id })).toMatchObject({
      success: true,
      story: { id: empty.id, title: null },
      items: [],
    })
    expect(await call(caller, { story_id: story.id })).toMatchObject({
      success: true,
      items: [],
      page_info: { has_next_page: false },
    })
  })

  it('answers a malformed cursor or excluded article as an error result, not a failure', async () => {
    const { story } = await createTestStoryMembers(2)

    expect(await call(caller, { story_id: story.id, after: 'not-a-cursor' })).toEqual({
      success: false,
      error: 'Invalid cursor',
    })
    expect(await call(caller, { story_id: story.id, exclude_item_id: 'nope' })).toEqual({
      success: false,
      error: 'Invalid excluded item ID',
    })
  })

  it('answers a deleted, missing or malformed story id as not found', async () => {
    const { story } = await createTestStoryMembers(1)
    await deleteTestStory(story.id)

    for (const storyId of [story.id, crypto.randomUUID(), 'not-a-uuid']) {
      expect(await call(caller, { story_id: storyId })).toEqual({
        success: false,
        error: 'Story not found',
      })
    }
  })
})
