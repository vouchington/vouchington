import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  addListPost,
  addListRssFeedItem,
  getListsContaining,
  importCommunityListClient,
  removeListPost,
  removeListRssFeedItem,
  searchMyLists,
} from '../lists'

const mockDelete = vi.mocked(clientApi.delete)
const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('lists client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches my lists with default limit', async () => {
    mockGet.mockResolvedValue({ results: [], lists: {}, page_info: {} })

    await searchMyLists()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/lists', {
      searchParams: { limit: 20, after: undefined },
    })
  })

  it('searches my lists with custom limit and cursor', async () => {
    mockGet.mockResolvedValue({ results: [], lists: {}, page_info: {} })

    await searchMyLists(10, { after: 'cursor-abc' })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/lists', {
      searchParams: { limit: 10, after: 'cursor-abc' },
    })
  })

  it('adds an rss feed item to a list', async () => {
    mockPost.mockResolvedValue(undefined)

    await addListRssFeedItem('list-1', 'item-2')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/lists/list-1/items/rss-feed-items', {
      rss_feed_item_id: 'item-2',
    })
  })

  it('removes an rss feed item from a list', async () => {
    mockDelete.mockResolvedValue(undefined)

    await removeListRssFeedItem('list-1', 'item-2')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/lists/list-1/items/rss-feed-items/item-2')
  })

  it('adds a post to a list', async () => {
    mockPost.mockResolvedValue(undefined)

    await addListPost('list-1', 'post-2')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/lists/list-1/items/posts', {
      post_id: 'post-2',
    })
  })

  it('removes a post from a list', async () => {
    mockDelete.mockResolvedValue(undefined)

    await removeListPost('list-1', 'post-2')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/lists/list-1/items/posts/post-2')
  })

  it('gets lists containing an rss feed item', async () => {
    mockGet.mockResolvedValue({ list_ids: ['list-1'] })

    await getListsContaining('rss_feed_item', 'item-2')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/contains', {
      searchParams: { item_type: 'rss_feed_item', entity_id: 'item-2' },
    })
  })

  it('gets lists containing a post', async () => {
    mockGet.mockResolvedValue({ list_ids: [] })

    await getListsContaining('post', 'post-2')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/lists/contains', {
      searchParams: { item_type: 'post', entity_id: 'post-2' },
    })
  })

  it('imports a community list', async () => {
    mockPost.mockResolvedValue({ posts: 3, items: 12 })

    const result = await importCommunityListClient('list-1', 'my-community')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/lists/list-1/import', {
      community_slug: 'my-community',
    })
    expect(result).toEqual({ posts: 3, items: 12 })
  })
})
