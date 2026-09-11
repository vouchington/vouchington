import type { TopicTypes, TopicMetrics } from '@/types/topics'

/**
 * Returns the first non-empty topic subpage path to use as the default redirect
 * when navigating to /:topic-type/:id without a subpage.
 * Matches the visibility logic in TopicDetailTabs. The 'posts' fallback relies on
 * the direct-URL escape hatch in TopicDetailTabs to keep the Posts tab visible
 * when all counts are zero.
 */
export function getDefaultTopicSubpage(
  metrics: Partial<TopicMetrics> | undefined,
  topic: { topic_type: TopicTypes; referral_program_id: string | null },
): string {
  const counts = metrics?.count
  const totalPosts =
    (counts?.discussions ?? 0) + (counts?.reviews ?? 0) + (counts?.['data-points'] ?? 0)
  const totalViewerPosts =
    (metrics?.viewer_count?.discussions ?? 0) +
    (metrics?.viewer_count?.reviews ?? 0) +
    (metrics?.viewer_count?.['data-points'] ?? 0)

  // RSS feed sources (articles, podcasts, videos) always default to 'latest':
  // their primary content is the feed (episodes/articles), not user posts.
  if (topic.topic_type === 'rss_feed') return 'latest'
  if (totalPosts > 0 || totalViewerPosts > 0) return 'posts'
  if (topic.topic_type === 'referral_program' || topic.referral_program_id != null)
    return 'referral-links'
  if ((counts?.latest ?? 0) > 0) return 'latest'
  if ((counts?.news ?? 0) > 0) return 'news'
  return 'posts'
}
