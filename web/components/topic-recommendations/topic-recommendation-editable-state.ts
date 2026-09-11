import type { Post } from '@/types/posts'
import {
  buildTopicRecommendationFieldsPayload,
  getRecommendationFormDefaults,
} from './topic-recommendation-form-codecs'

export interface EditableState {
  topic_title: string
  topic_slug: string
  topic_markdown: string
  topic_hostname: string
  topic_hostnames: string
  topic_aliases: string
  rejection_reason: string
  topic_type: 'topic' | 'referral_program' | 'card'
  example_referral_link: string
  landing_page_urls: string
}

export type TopicRecommendationEditablePost = Pick<
  Post,
  | 'title'
  | 'markdown'
  | 'declared_language'
  | 'lingua_rs_detected_language'
  | 'topic_recommendation'
>

export type TopicRecommendationEditablePostWithId = TopicRecommendationEditablePost &
  Pick<Post, 'id'>

export function buildEditableState(post: TopicRecommendationEditablePost): EditableState {
  const defaults = getRecommendationFormDefaults(post)
  return {
    topic_title: defaults.topic_title,
    topic_slug: defaults.topic_slug,
    topic_markdown: defaults.topic_markdown,
    topic_hostname: defaults.topic_hostname,
    topic_hostnames: defaults.topic_hostnames,
    topic_aliases: defaults.topic_aliases,
    rejection_reason: post.topic_recommendation?.rejection_reason ?? '',
    topic_type: defaults.topic_type,
    example_referral_link: defaults.example_referral_link,
    landing_page_urls: defaults.landing_page_urls,
  }
}

export function buildTopicRecommendationUpdatePayload(editableState: EditableState) {
  return buildTopicRecommendationFieldsPayload({
    topic_title: editableState.topic_title,
    topic_slug: editableState.topic_slug,
    topic_markdown: editableState.topic_markdown,
    topic_hostname: editableState.topic_hostname.trim(),
    topic_hostnames: editableState.topic_hostnames,
    topic_aliases: editableState.topic_aliases,
    topic_type: editableState.topic_type,
    example_referral_link: editableState.example_referral_link,
    landing_page_urls: editableState.landing_page_urls,
  })
}

export function editableStateMatchesPost(
  post: TopicRecommendationEditablePost,
  editableState: EditableState,
): boolean {
  return (
    JSON.stringify(buildTopicRecommendationUpdatePayload(buildEditableState(post))) ===
    JSON.stringify(buildTopicRecommendationUpdatePayload(editableState))
  )
}
