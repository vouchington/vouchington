import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEntityRelations } from '../entity-relations'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

vi.mock(import('../elections'), () => ({
  submitVote: vi.fn<VitestLooseMock>(),
}))

describe('entity-relations client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      entity_relations: [],
      entity_relation_elections: [],
      election_votes: [],
    })
  })

  describe('fetchEntityRelations', () => {
    it('serializes summary mode without ordinary pagination filters', async () => {
      await fetchEntityRelations('post', 'post-1', 'related', 'url', { summary: true })

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/entity-relations/post/post-1/related/url?summary=true',
      )
    })

    it('calls GET with the correct path and no query string when sort is omitted', async () => {
      await fetchEntityRelations('rss_feed_item', 'item-1', 'category', 'topic')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/entity-relations/rss_feed_item/item-1/category/topic',
      )
    })

    it('appends sort query param when sort option is provided', async () => {
      await fetchEntityRelations('rss_feed_item', 'item-1', 'category', 'topic', { sort: 'best' })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/entity-relations/rss_feed_item/item-1/category/topic?sort=best',
      )
    })

    it('preserves the vote filter and cursor on continuation requests', async () => {
      await fetchEntityRelations('post', 'post-1', 'category', 'topic', {
        sort: 'best',
        after: 'cursor-1',
        positiveNetVoteScore: true,
      })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/entity-relations/post/post-1/category/topic?sort=best&after=cursor-1&positiveNetVoteScore=true',
      )
    })

    it('URL-encodes entity type and id', async () => {
      await fetchEntityRelations('rss feed item', 'item/1', 'category', 'topic')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/entity-relations/rss%20feed%20item/item%2F1/category/topic',
      )
    })
  })
})
