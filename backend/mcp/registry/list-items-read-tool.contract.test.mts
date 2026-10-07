import { randomUUID } from 'node:crypto'
import { addListItem, softDeleteList } from '@services/lists'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  createTestUser,
  deleteTestPost,
  insertTestList,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type Item = {
  id: string
  list_id: string
  item_type: string
  entity_id: string
  media_type: string | null
}
type Page = {
  success: true
  results: Item[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
type Scopes = Parameters<typeof callStructuredMcpTool>[3]

const NOT_FOUND = { success: false, error: 'List not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }
const READ = ['lists:read'] as const
const OWNED_PRIVATE = ['lists:read', 'post-relations.owned-private:write'] as const
const random = createRandomString(6)

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const entities = (page: { results: Item[] }) => page.results.map(item => item.entity_id)

describe('get_list_items — real DB', () => {
  let owner: McpContractCaller
  let stranger: McpContractCaller
  let counter = 0

  const getItems = (list_id: string, args: Body = {}, who = owner, scopes: Scopes = READ) =>
    callStructuredMcpTool(who, 'get_list_items', { list_id, ...args }, scopes) as Promise<Page>
  const newPost = (privacy: 'public' | 'private' = 'public') => {
    const label = `${random}-${(counter += 1)}`
    return insertTestPost({
      title: `List item post ${label}`,
      slug: `list-item-post-${label}`,
      createdById: owner.id,
      markdown: 'Body of the post',
      privacy,
      // A private post is never broadcast to everyone.
      broadcast: privacy === 'private' ? 'users' : 'everyone',
    })
  }
  // One after another: items page newest first by id, so add order is the reverse page order.
  async function listWith(
    visibility: 'public' | 'private',
    postIds: string[],
  ): Promise<{ id: string }> {
    const list = await insertTestList({
      ownerUserId: owner.id,
      name: `Items ${random} ${(counter += 1)}`,
      visibility,
    })
    for (const postId of postIds) await addListItem(list.id, 'post', postId)
    return list
  }

  beforeAll(async () => {
    ;[owner, stranger] = (await Promise.all([createTestUser(), createTestUser()])).map(
      asCaller,
    ) as McpContractCaller[]
  })

  it('lists the items of a public list, newest first, to the owner and to anyone else', async () => {
    const [first, second] = [await newPost(), await newPost()]
    const list = await listWith('public', [first, second])

    for (const who of [owner, stranger]) {
      const page = await getItems(list.id, {}, who)

      expect(entities(page)).toEqual([second, first])
      expect(page.results[0]).toEqual({
        id: expect.any(String),
        list_id: list.id,
        item_type: 'post',
        entity_id: second,
        order_index: expect.any(Number),
        media_type: null,
        created_at: expect.any(String),
      })
      expect(page.page_info.has_next_page).toBe(false)
    }
  })

  it('lists an RSS feed item with its media type and filters by that type', async () => {
    const topicId = await insertTestTopic({
      name: `Items topic ${random}`,
      slug: `items-topic-${random}`,
      createdById: owner.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Items feed ${random}` })
    const rssItem = await createTestRssFeedItemWithUrl(feedId)
    const post = await newPost()
    const list = await listWith('public', [post])
    await addListItem(list.id, 'rss_feed_item', rssItem.id)

    const all = await getItems(list.id)
    const rss = all.results.find(item => item.item_type === 'rss_feed_item')!
    const filtered = await getItems(list.id, { media_type: rss.media_type! })

    expect(entities(all)).toEqual([rssItem.id, post])
    expect(rss.media_type).toEqual(expect.any(String))
    expect(entities(filtered)).toEqual([rssItem.id])
    expect(entities(await getItems(list.id, { media_type: `none-${random}` }))).toEqual([])
  })

  it('leaves out a private post and a deleted post, even the owner’s own', async () => {
    const [shown, hidden, gone] = [await newPost(), await newPost('private'), await newPost()]
    const list = await listWith('public', [shown, hidden, gone])
    await deleteTestPost(gone)

    for (const scopes of [READ, OWNED_PRIVATE]) {
      expect(entities(await getItems(list.id, {}, owner, scopes))).toEqual([shown])
    }
  })

  it('keeps paging past hidden items, as the cursor advances over every one of them', async () => {
    const [first, hidden, last] = [await newPost(), await newPost('private'), await newPost()]
    const list = await listWith('public', [first, hidden, last])

    const one = await getItems(list.id, { limit: 1 })
    const two = await getItems(list.id, { limit: 1, after: one.page_info.end_cursor! })
    const three = await getItems(list.id, { limit: 1, after: two.page_info.end_cursor! })

    expect([entities(one), entities(two), entities(three)]).toEqual([[last], [], [first]])
    expect([one, two, three].map(page => page.page_info.has_next_page)).toEqual([true, true, false])
  })

  it('pages by cursor like signed-out REST', async () => {
    const posts = [await newPost(), await newPost(), await newPost()]
    const list = await listWith('public', posts)
    const rest = await createRequest().get(`/api/v1/lists/${list.id}/items?limit=2`).expect(200)

    const first = await getItems(list.id, { limit: 2 })
    const second = await getItems(list.id, { limit: 2, after: first.page_info.end_cursor! })
    const restSecond = await createRequest()
      .get(`/api/v1/lists/${list.id}/items?limit=2&after=${rest.body.page_info.end_cursor}`)
      .expect(200)

    expect(first.page_info.end_cursor).toBe(rest.body.page_info.end_cursor)
    expect(first.results.map(item => item.id)).toEqual(
      rest.body.results.map((item: { id: string }) => item.id),
    )
    expect(second.results.map(item => item.id)).toEqual(
      restSecond.body.results.map((item: { id: string }) => item.id),
    )
    expect(second.page_info.has_next_page).toBe(false)
  })

  it('refuses a malformed cursor', async () => {
    const list = await listWith('public', [await newPost()])

    expect(await getItems(list.id, { after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
  })

  it('reads the items of a private list only for its owner with the exact private grant', async () => {
    const post = await newPost()
    const list = await listWith('private', [post])
    const mine = await insertTestList({
      ownerUserId: stranger.id,
      name: `Strangers ${random}`,
      visibility: 'private',
    })
    const removedList = await listWith('public', [post])
    await softDeleteList(owner.id, removedList.id)

    expect(entities(await getItems(list.id, {}, owner, OWNED_PRIVATE))).toEqual([post])
    const denied = [
      await getItems(list.id, {}, owner, READ),
      await getItems(list.id, {}, owner, ['lists:read', 'mcp.user:read', 'mcp.user:write']),
      await getItems(list.id, {}, stranger, OWNED_PRIVATE),
      await getItems(mine.id, {}, owner, OWNED_PRIVATE),
      await getItems(removedList.id, {}, owner, OWNED_PRIVATE),
      await getItems(randomUUID(), {}, owner, OWNED_PRIVATE),
    ]
    expect(denied).toEqual(denied.map(() => NOT_FOUND))
  })
})
