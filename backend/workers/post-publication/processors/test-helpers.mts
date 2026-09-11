import type {
  ClaimedPostPublicationDirtyWork,
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  deleteOrphanPostPublicationProjectionReceipts,
  listAvailablePostPublicationDirtyWork,
  reconcilePostPublicationDirtyWork,
  releasePostPublicationDirtyWorkLease,
  renewPostPublicationDirtyWorkLease,
  updatePostPublicationDirtyWorkCursors,
} from '@services/post-publication'
import type {
  PublicationSitemapTarget,
  ReconciliationPost,
} from '@services/post-publication/reconcile'
import type { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import type { enqueueContinuePostPublicationReconciliation } from '@queues/post-publication/enqueues'
import type { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import type { enqueueUpdatePostDaySitemapForReconciliation } from '@queues/sitemaps/enqueues'
import type {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'
import type { enqueueBulkRefreshPostMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'
import type {
  invalidatePostPublicationTopicsStrict,
  invalidatePostPublicSurfacesStrict,
} from '@services/posts/public-surfaces'
import type { updateTopicRatingStats } from '@services/topics/ratings'
import type { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import { vi } from 'vitest'

export const work: ClaimedPostPublicationDirtyWork = {
  id: '00000000-0000-7000-8000-000000000001',
  post_id: '00000000-0000-7000-8000-000000000002',
  author_user_id: null,
  community_id: null,
  rss_feed_id: null,
  topic_alias_id: null,
  story_id: null,
  reasons: ['post_created'],
  generation: '1',
  cursor_post_id: null,
  cursor_topic_id: null,
  cursor_key_id: null,
  lease_token: '00000000-0000-7000-8000-000000000004',
  leased_at: new Date(),
  lease_expires_at: new Date(Date.now() + 60_000),
}

export const post: ReconciliationPost = {
  id: work.post_id!,
  parent_id: null,
  root_id: null,
  created_by_id: '00000000-0000-7000-8000-000000000005',
  community_id: null,
  post_type: 'discussion',
  sitemap_day: '2026-09-01',
  is_public: true,
  eligibility_fingerprint: 'publication-state',
  projection_identity: {
    topicIds: [],
    identityKeys: [{ kind: 'author', value: 'primary-author' }],
    sitemapTargets: [],
  },
}

export function makeResult(
  options: {
    processed: number
    posts?: ReconciliationPost[]
    hasMorePosts?: boolean
    cursorPostId?: string | null
    orphanReceiptPostIds?: string[]
    missingPostIds?: string[]
    hasMoreOrphanReceipts?: boolean
    topicIds?: string[]
    hasMoreTopics?: boolean
    identityKeys?: Array<{ id: string; kind: string; value: string }>
    rssFeedItemIds?: string[]
    hasMoreIdentityKeys?: boolean
    cursorKeyId?: string | null
  } = { processed: 1 },
) {
  return {
    processed: options.processed,
    hasMorePosts: options.hasMorePosts ?? false,
    posts: options.posts ?? (options.processed === 0 ? [] : [post]),
    orphanReceiptPostIds: options.orphanReceiptPostIds ?? [],
    missingPostIds: options.missingPostIds ?? [],
    hasMoreOrphanReceipts: options.hasMoreOrphanReceipts ?? false,
    cursorPostId: options.cursorPostId ?? post.id,
    topicIds: options.topicIds ?? ['00000000-0000-7000-8000-000000000006'],
    hasMoreTopics: options.hasMoreTopics ?? false,
    sitemapTargets: [
      { postType: 'discussion', day: '2026-09-01' },
    ] satisfies PublicationSitemapTarget[],
    identityKeys: options.identityKeys ?? [
      {
        id: '00000000-0000-7000-8000-000000000009',
        kind: 'author',
        value: 'primary-author',
      },
    ],
    rssFeedItemIds: options.rssFeedItemIds ?? [],
    hasMoreIdentityKeys: options.hasMoreIdentityKeys ?? false,
    cursorKeyId: options.cursorKeyId ?? null,
  }
}

export function makeDependencies(result = makeResult()) {
  return {
    listAvailablePostPublicationDirtyWork: vi
      .fn<typeof listAvailablePostPublicationDirtyWork>()
      .mockResolvedValue([work]),
    claimPostPublicationDirtyWork: vi
      .fn<typeof claimPostPublicationDirtyWork>()
      .mockResolvedValue(work),
    reconcilePostPublicationDirtyWork: vi
      .fn<typeof reconcilePostPublicationDirtyWork>()
      .mockResolvedValue(result),
    reconcileReviewSuccessionsForPostIds: vi
      .fn<typeof reconcileReviewSuccessionsForPostIds>()
      .mockResolvedValue({ changedPostIds: [] }),
    invalidatePost: vi.fn<typeof invalidatePostStrict>().mockResolvedValue(undefined),
    invalidatePostPublicSurfaces: vi
      .fn<typeof invalidatePostPublicSurfacesStrict>()
      .mockResolvedValue(undefined),
    invalidatePostPublicationTopics: vi
      .fn<typeof invalidatePostPublicationTopicsStrict>()
      .mockResolvedValue(undefined),
    withPostPublicationReconciliationLock: vi.fn<
      (postId: string, operation: () => Promise<void>) => Promise<void>
    >((_postId: string, operation: () => Promise<void>) => operation()),
    withPostPublicationReconciliationLocks: vi.fn<
      (postIds: readonly string[], operation: () => Promise<void>) => Promise<void>
    >((_postIds: readonly string[], operation: () => Promise<void>) => operation()),
    updateTopicRatingStats: vi.fn<typeof updateTopicRatingStats>().mockResolvedValue(undefined),
    enqueueUpdatePostDaySitemapForReconciliation: vi
      .fn<typeof enqueueUpdatePostDaySitemapForReconciliation>()
      .mockResolvedValue(undefined),
    enqueueBulkRefreshPostMetricsById: vi
      .fn<typeof enqueueBulkRefreshPostMetricsById>()
      .mockResolvedValue(undefined),
    enqueueRefreshTopHashtags: vi
      .fn<typeof enqueueRefreshTopHashtags>()
      .mockResolvedValue(undefined),
    enqueueBulkReconcilePostNotifications: vi
      .fn<typeof enqueueBulkReconcilePostNotifications>()
      .mockResolvedValue(undefined),
    enqueueBulkReconcileRssFeedItemNotifications: vi
      .fn<typeof enqueueBulkReconcileRssFeedItemNotifications>()
      .mockResolvedValue(undefined),
    acknowledgePostPublicationProjectionReceipts: vi
      .fn<typeof acknowledgePostPublicationProjectionReceipts>()
      .mockResolvedValue(true),
    deleteOrphanPostPublicationProjectionReceipts: vi
      .fn<typeof deleteOrphanPostPublicationProjectionReceipts>()
      .mockResolvedValue(true),
    renewPostPublicationDirtyWorkLease: vi
      .fn<typeof renewPostPublicationDirtyWorkLease>()
      .mockResolvedValue(true),
    updatePostPublicationDirtyWorkCursors: vi
      .fn<typeof updatePostPublicationDirtyWorkCursors>()
      .mockResolvedValue(true),
    invalidateUser: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateCommunity: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateRssFeed: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    acknowledgePostPublicationDirtyWork: vi
      .fn<typeof acknowledgePostPublicationDirtyWork>()
      .mockResolvedValue(true),
    enqueueContinuePostPublicationReconciliation: vi
      .fn<typeof enqueueContinuePostPublicationReconciliation>()
      .mockResolvedValue(undefined),
    releasePostPublicationDirtyWorkLease: vi
      .fn<typeof releasePostPublicationDirtyWorkLease>()
      .mockResolvedValue(true),
  }
}
