import type { TopicMergeResponseBody } from '@/types/api-responses'
import { storyText } from './story-mutation-bodies'

let topicMerge: TopicMergeResponseBody | null = null

export function resetStoryTopicMerge(): void {
  topicMerge = null
}

export function storyTopicMergeGet(endpoint: string): unknown | undefined {
  if (/^\/api\/v1\/topics\/[^/]+\/merges\/[^/]+$/.test(endpoint) && topicMerge) return topicMerge
  return undefined
}

export function storyTopicMergePost(endpoint: string, body: unknown): unknown | undefined {
  if (!/^\/api\/v1\/topics\/[^/]+\/merges$/.test(endpoint)) return undefined
  const sourceId = endpoint.split('/')[4] ?? 'source-topic'
  topicMerge = {
    topic_merge: {
      id: 'topic-merge-story',
      source_topic_id: sourceId,
      destination_topic_id: storyText(body, 'destination_id_or_slug') || 'topic-story',
      status: 'queued',
      stage: 'preflight',
      created_at: '2026-09-26T00:00:00.000Z',
      completed_at: null,
      error_code: null,
      status_url: `/api/v1/topics/${sourceId}/merges/topic-merge-story`,
    },
  }
  return topicMerge
}
