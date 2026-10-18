import type { Topic } from './types.mts'

export type TopicRedirect = {
  source_topic_id: string
  source_topic_slug: string
  source_topic_type: Topic['topic_type']
  destination_topic_id: string
}

export type TopicWithRedirect = {
  topic: Topic
  topic_redirect?: TopicRedirect
}

export type TopicRedirectRow = Topic & {
  source_topic_id?: string | null
  source_topic_slug?: string | null
  source_topic_type?: Topic['topic_type'] | null
}

export function mapTopicWithRedirect(row: TopicRedirectRow): TopicWithRedirect {
  const { source_topic_id, source_topic_slug, source_topic_type, ...topic } = row

  if (!source_topic_id || !source_topic_slug || !source_topic_type) {
    return { topic }
  }

  return {
    topic,
    topic_redirect: {
      source_topic_id,
      source_topic_slug,
      source_topic_type,
      destination_topic_id: topic.id,
    },
  }
}
