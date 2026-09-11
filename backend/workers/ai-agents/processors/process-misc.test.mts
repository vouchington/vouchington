import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type {
  CustomerSupportJobData,
  StoryClusteringJobData,
  WikipediaRecommenderJobData,
} from '@queues/ai-agents/types'
import {
  processCustomerSupport,
  processStoryClustering,
  processWikipediaRecommender,
} from './process-misc.mts'

function makeJob(data: StoryClusteringJobData): Job<StoryClusteringJobData> {
  return { data } as Job<StoryClusteringJobData>
}

describe('process-misc', () => {
  const mockCluster = vi.fn<typeof import('@services/stories/cluster').clusterRssFeedItem>()
  const mockHasEmbedding =
    vi.fn<typeof import('@services/bedrock-embeddings').hasRssFeedItemEmbedding>()
  const mockEnqueue =
    vi.fn<typeof import('@queues/ai-agents/enqueues/story-clustering').enqueueStoryClustering>()
  const mockGenerateSupportResponse =
    vi.fn<typeof import('@agents/customer-support').generateSupportResponse>()
  const mockRecommendTopicsForContent =
    vi.fn<typeof import('@agents/wikipedia-recommender').recommendTopicsForContent>()

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockResolvedValue(undefined)
  })

  it('cluster succeeds and returns result', async () => {
    const storyResult = { storyId: 'story-abc', created: true }
    mockCluster.mockResolvedValue(storyResult)

    const result = await processStoryClustering(makeJob({ rss_feed_item_id: 'item-1' }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(result).toEqual(storyResult)
    expect(mockHasEmbedding).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('re-enqueues when cluster returns null and embedding is missing', async () => {
    mockCluster.mockResolvedValue(null)
    mockHasEmbedding.mockResolvedValue(false)

    await processStoryClustering(makeJob({ rss_feed_item_id: 'item-2', embedding_retries: 0 }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(mockEnqueue).toHaveBeenCalledWith('item-2', undefined, 1)
  })

  it('does not re-enqueue when retries are at cap', async () => {
    mockCluster.mockResolvedValue(null)

    const result = await processStoryClustering(
      makeJob({ rss_feed_item_id: 'item-3', embedding_retries: 10 }),
      {
        clusterRssFeedItem: mockCluster,
        hasRssFeedItemEmbedding: mockHasEmbedding,
        enqueueStoryClustering: mockEnqueue,
        generateSupportResponse: mockGenerateSupportResponse,
        recommendTopicsForContent: mockRecommendTopicsForContent,
      },
    )

    expect(result).toBeNull()
    expect(mockHasEmbedding).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('skips re-enqueue when embedding is already present', async () => {
    mockCluster.mockResolvedValue(null)
    mockHasEmbedding.mockResolvedValue(true)

    await processStoryClustering(makeJob({ rss_feed_item_id: 'item-4' }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('increments retries correctly', async () => {
    mockCluster.mockResolvedValue(null)
    mockHasEmbedding.mockResolvedValue(false)

    await processStoryClustering(makeJob({ rss_feed_item_id: 'item-5', embedding_retries: 5 }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(mockEnqueue).toHaveBeenCalledWith('item-5', undefined, 6)
  })

  it('defaults missing embedding_retries to 0', async () => {
    mockCluster.mockResolvedValue(null)
    mockHasEmbedding.mockResolvedValue(false)

    await processStoryClustering(makeJob({ rss_feed_item_id: 'item-6' }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(mockEnqueue).toHaveBeenCalledWith('item-6', undefined, 1)
  })

  it('returns null when embedding is present', async () => {
    mockCluster.mockResolvedValue(null)
    mockHasEmbedding.mockResolvedValue(true)

    const result = await processStoryClustering(makeJob({ rss_feed_item_id: 'item-7' }), {
      clusterRssFeedItem: mockCluster,
      hasRssFeedItemEmbedding: mockHasEmbedding,
      enqueueStoryClustering: mockEnqueue,
      generateSupportResponse: mockGenerateSupportResponse,
      recommendTopicsForContent: mockRecommendTopicsForContent,
    })

    expect(result).toBeNull()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('generates customer support responses', async () => {
    await processCustomerSupport(
      { data: { threadId: 'thread-1' } } as Job<CustomerSupportJobData>,
      {
        clusterRssFeedItem: mockCluster,
        hasRssFeedItemEmbedding: mockHasEmbedding,
        enqueueStoryClustering: mockEnqueue,
        generateSupportResponse: mockGenerateSupportResponse,
        recommendTopicsForContent: mockRecommendTopicsForContent,
      },
    )

    expect(mockGenerateSupportResponse).toHaveBeenCalledWith('thread-1')
  })

  it('passes the durable customer-support idempotency key to the agent', async () => {
    await processCustomerSupport(
      {
        data: {
          threadId: 'thread-1',
          idempotencyKey: 'support_inbound_email__message-1__customer_support',
          supportMessageId: 'message-1',
        },
        attemptsMade: 0,
      } as Job<CustomerSupportJobData>,
      {
        clusterRssFeedItem: mockCluster,
        hasRssFeedItemEmbedding: mockHasEmbedding,
        enqueueStoryClustering: mockEnqueue,
        generateSupportResponse: mockGenerateSupportResponse,
        recommendTopicsForContent: mockRecommendTopicsForContent,
      },
    )

    expect(mockGenerateSupportResponse).toHaveBeenCalledWith('thread-1', {
      idempotencyKey: 'support_inbound_email__message-1__customer_support',
      supportMessageId: 'message-1',
      reclaimLiveLease: false,
    })
  })

  it('allows a retried stable job to reclaim its live incomplete run', async () => {
    await processCustomerSupport(
      {
        data: {
          threadId: 'thread-1',
          idempotencyKey: 'support_inbound_email__message-1__customer_support',
          supportMessageId: 'message-1',
        },
        attemptsMade: 1,
      } as Job<CustomerSupportJobData>,
      {
        clusterRssFeedItem: mockCluster,
        hasRssFeedItemEmbedding: mockHasEmbedding,
        enqueueStoryClustering: mockEnqueue,
        generateSupportResponse: mockGenerateSupportResponse,
        recommendTopicsForContent: mockRecommendTopicsForContent,
      },
    )

    expect(mockGenerateSupportResponse).toHaveBeenCalledWith('thread-1', {
      idempotencyKey: 'support_inbound_email__message-1__customer_support',
      supportMessageId: 'message-1',
      reclaimLiveLease: true,
    })
  })

  it('runs wikipedia recommendations', async () => {
    await processWikipediaRecommender(
      {
        data: { entity_type: 'topics', entity_ids: ['topic-1'] },
      } as unknown as Job<WikipediaRecommenderJobData>,
      {
        clusterRssFeedItem: mockCluster,
        hasRssFeedItemEmbedding: mockHasEmbedding,
        enqueueStoryClustering: mockEnqueue,
        generateSupportResponse: mockGenerateSupportResponse,
        recommendTopicsForContent: mockRecommendTopicsForContent,
      },
    )

    expect(mockRecommendTopicsForContent).toHaveBeenCalledWith('topics', ['topic-1'])
  })
})
