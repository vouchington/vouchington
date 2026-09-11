import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  addCommunityListItemByType,
  addCommunityListDomain,
  addCommunityListPost,
  addCommunityListRssFeed,
  addCommunityListTopic,
  addCommunityListUrl,
  removeCommunityListItem,
} from '../community-list-items'

const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('community list item client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('adds community list items through their resource paths', async () => {
    mockPost.mockResolvedValue(undefined)

    await addCommunityListTopic('rewards', 'topic-1')
    await addCommunityListRssFeed('rewards', 'feed-1')
    await addCommunityListPost('rewards', 'post-1')
    await addCommunityListDomain('rewards', 'hostname-1')
    await addCommunityListUrl('rewards', 'url-1')

    expect(mockPost).toHaveBeenNthCalledWith(1, '/api/v1/communities/rewards/list-items/topics', {
      topic_id: 'topic-1',
    })
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/api/v1/communities/rewards/list-items/rss-feeds',
      { rss_feed_id: 'feed-1' },
    )
    expect(mockPost).toHaveBeenNthCalledWith(3, '/api/v1/communities/rewards/list-items/posts', {
      post_id: 'post-1',
    })
    expect(mockPost).toHaveBeenNthCalledWith(4, '/api/v1/communities/rewards/list-items/domains', {
      url_hostname_id: 'hostname-1',
    })
    expect(mockPost).toHaveBeenNthCalledWith(5, '/api/v1/communities/rewards/list-items/urls', {
      url_id: 'url-1',
    })
  })

  it('adds community list items by entity type through the catalog path', async () => {
    mockPost.mockResolvedValue(undefined)

    await addCommunityListItemByType('rewards', 'url_hostname', 'hostname-1')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/rewards/list-items/domains', {
      url_hostname_id: 'hostname-1',
    })
  })

  it('removes community list items through their resource paths', async () => {
    mockDelete.mockResolvedValue(undefined)

    await removeCommunityListItem('rewards', 'topic', 'topic-1')
    await removeCommunityListItem('rewards', 'rss_feed', 'feed-1')
    await removeCommunityListItem('rewards', 'post', 'post-1')
    await removeCommunityListItem('rewards', 'url_hostname', 'hostname-1')
    await removeCommunityListItem('rewards', 'url', 'url-1')

    expect(mockDelete).toHaveBeenNthCalledWith(
      1,
      '/api/v1/communities/rewards/list-items/topics/topic-1',
    )
    expect(mockDelete).toHaveBeenNthCalledWith(
      2,
      '/api/v1/communities/rewards/list-items/rss-feeds/feed-1',
    )
    expect(mockDelete).toHaveBeenNthCalledWith(
      3,
      '/api/v1/communities/rewards/list-items/posts/post-1',
    )
    expect(mockDelete).toHaveBeenNthCalledWith(
      4,
      '/api/v1/communities/rewards/list-items/domains/hostname-1',
    )
    expect(mockDelete).toHaveBeenNthCalledWith(
      5,
      '/api/v1/communities/rewards/list-items/urls/url-1',
    )
  })
})
