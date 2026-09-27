import { beforeEach, describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { StoryPageResponse } from '@/types/rss-feed-items'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('./instance'),
  () => ({ clientApi: { get: getMock } }) as unknown as typeof import('./instance'),
)

import { getStoryMemberPage } from './stories'

const response: StoryPageResponse = {
  story: {
    id: 'story-1',
    title: null,
    cluster_reason: null,
    published_at: null,
    official_rss_feed_item_id: null,
  },
  item_ids: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  rss_feed_items: {},
  rss_feed_item_elections: {},
  rss_feed_item_embeds: {},
  rss_feed_item_thumbnail_url: {},
  rss_feed_item_content_html: {},
  related_posts_by_url_id: {},
  story_post_ids: {},
  posts: {},
  posts_metrics: {},
  bookmarks: {},
  election_votes: {},
  rss_feed_bookmarks: {},
}

describe('getStoryMemberPage', () => {
  beforeEach(() => getMock.mockReset())

  it('encodes the story path and sends the original exclusion with the opaque cursor and default page size', async () => {
    await expectApiWrapperCall({
      mock: getMock,
      response,
      call: () =>
        getStoryMemberPage('story / id', { after: 'opaque cursor', excludeItemId: 'primary' }),
      expectedArgs: [
        '/api/v1/stories/story%20%2F%20id',
        { searchParams: { limit: 25, after: 'opaque cursor', exclude_item_id: 'primary' } },
      ],
    })
  })

  it('allows the fixture producer to request a one-item first page without an after cursor', async () => {
    await expectApiWrapperCall({
      mock: getMock,
      response,
      call: () => getStoryMemberPage('story-1', { excludeItemId: 'primary', limit: 1 }),
      expectedArgs: [
        '/api/v1/stories/story-1',
        { searchParams: { limit: 1, exclude_item_id: 'primary' } },
      ],
    })
  })
})
