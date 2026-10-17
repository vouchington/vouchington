import { updateTopicRatingStats } from '@services/topics'
import { refresh } from '@services/entity-fetch/refresh'
import { refreshUserMetricsCache } from '@services/entity-fetch/metrics'

export function processUpdateTopicRatingStats(data: { topicId: string }): Promise<void> {
  return updateTopicRatingStats(data.topicId)
}

export async function processRefreshTopicMetrics(data: { id: string }): Promise<void> {
  await refresh.topic_metrics(data.id)
}

export async function processRefreshPostMetrics(data: { id: string }): Promise<void> {
  await refresh.post_metrics(data.id)
}

export async function processRefreshUserMetrics(data: { id: string }): Promise<void> {
  await refreshUserMetricsCache(data.id)
}
