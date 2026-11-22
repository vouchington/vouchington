import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TopicFollowContextResponseBody } from '@/types/api-responses'
import { fetchTopicFollowContext } from '../topics'

describe('fetchTopicFollowContext', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests the next topic follower page with an opaque cursor and returns its metadata', async () => {
    const response: TopicFollowContextResponseBody = {
      positive_by_following: { total: 0, users: [] },
      negative_by_following: { total: 0, users: [] },
      following_topic_followers: {
        total: 12,
        users: [{ id: 'person-1', username: 'mira', account_type: null }],
        total_is_exact: false,
        next_cursor: 'next-opaque-cursor',
      },
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(response))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTopicFollowContext('travel / rewards', 'opaque+/=&?')).resolves.toEqual(
      response,
    )

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/topics/travel%20%2F%20rewards/follow-context?after=opaque%2B%2F%3D%26%3F',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })
})
