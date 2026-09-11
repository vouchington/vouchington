import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  clearUserVouchVote,
  clearVote,
  isRecommendationChoice,
  isSentimentChoice,
  submitAgentModerationVote,
  submitHostnameVote,
  submitPostVote,
  submitPostRecommendationVote,
  submitRssFeedItemVote,
  submitTopicVote,
  submitUserVouchVote,
} from '../elections'

const mockDelete = vi.mocked(clientApi.delete)
const mockPut = vi.mocked(clientApi.put)

describe('elections client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('recognizes both recommendation choices and rejects other policies', () => {
    expect(isRecommendationChoice('support')).toBe(true)
    expect(isRecommendationChoice('oppose')).toBe(true)
    expect(isRecommendationChoice('vouch')).toBe(false)
    expect(isRecommendationChoice(undefined)).toBe(false)
  })

  it('recognizes every sentiment choice and rejects other policies', () => {
    for (const choice of ['vouch', 'like', 'neutral', 'dislike', 'disavow'] as const) {
      expect(isSentimentChoice(choice)).toBe(true)
    }
    expect(isSentimentChoice('support')).toBe(false)
    expect(isSentimentChoice(undefined)).toBe(false)
  })

  it('encodes direct vote clears', async () => {
    await expectApiWrapperCall({
      mock: mockDelete,
      response: undefined,
      call: () => clearVote('entity-relations', 'relation / 1'),
      expectedArgs: ['/api/v1/entity-relations/relation%20%2F%201/vote'],
    })
  })

  it('uses each policy-specific submission endpoint and semantic request body', async () => {
    const submissions = [
      {
        call: () => submitPostVote('post / 1', 'like'),
        expectedArgs: ['/api/v1/posts/post%20%2F%201/vote', { choice: 'like' }],
      },
      {
        call: () => submitPostRecommendationVote('post / 1', 'support'),
        expectedArgs: ['/api/v1/posts/post%20%2F%201/vote', { choice: 'support' }],
      },
      {
        call: () => submitTopicVote('topic / 1', 'neutral'),
        expectedArgs: ['/api/v1/topics/topic%20%2F%201/vote', { choice: 'neutral' }],
      },
      {
        call: () => submitHostnameVote('host / 1', 'vouch'),
        expectedArgs: ['/api/v1/hostnames/host%20%2F%201/vote', { choice: 'vouch' }],
      },
      {
        call: () => submitRssFeedItemVote('feed / 1', 'dislike'),
        expectedArgs: ['/api/v1/rss-feed-items/feed%20%2F%201/vote', { choice: 'dislike' }],
      },
      {
        call: () => submitUserVouchVote('user / 1', 'disavow'),
        expectedArgs: ['/api/v1/users/user%20%2F%201/vouch-vote', { choice: 'disavow' }],
      },
      {
        call: () => submitAgentModerationVote('moderation / 1', 'accurate'),
        expectedArgs: [
          '/api/v1/agent-moderations/moderation%20%2F%201/vote',
          { choice: 'accurate' },
        ],
      },
    ] as const

    for (const { call, expectedArgs } of submissions) {
      await expectApiWrapperCall({
        mock: mockPut,
        response: undefined,
        call,
        expectedArgs,
      })
      mockPut.mockClear()
    }
  })

  it('clears the user vouch endpoint separately from generic votes', async () => {
    await expectApiWrapperCall({
      mock: mockDelete,
      response: undefined,
      call: () => clearUserVouchVote('user / 1'),
      expectedArgs: ['/api/v1/users/user%20%2F%201/vouch-vote'],
    })
  })
})
