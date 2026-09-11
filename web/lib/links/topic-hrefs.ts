import { getTopicTypeSlug } from '@/types/topics'
import type { PostType } from '@/types/posts'
import { getPostSlugFromType } from '@/lib/route-configs'

export type TopicTab = 'posts' | 'reviews' | 'data-points' | 'news' | 'latest' | 'referral-links'

export type TopicSettingsSubPage =
  | 'about'
  | 'behavior'
  | 'domains'
  | 'source'
  | 'aliases'
  | 'merge'
  | 'validations'
export type TopicManagementTab = 'settings' | `settings/${TopicSettingsSubPage}`

export type TopicHrefInput =
  | { topic_type: string; slug: string; id?: string }
  | { topic_type: string; id: string; slug?: string | null }

export function createTopicPathname(topic: TopicHrefInput, suffix = ''): string {
  const idOrSlug = topic.slug || topic.id
  return `/${getTopicTypeSlug(topic.topic_type)}/${idOrSlug}${suffix}`
}

export function createTopicCollectionPathname(suffix = ''): string {
  return `/topics${suffix}`
}

export function topicHref(topic: TopicHrefInput, tab?: TopicTab): string {
  return createTopicPathname(topic, tab ? `/${tab}` : '')
}

export function topicIdOrSlug(topic: { id: string; slug?: string | null }): string {
  return topic.slug || topic.id
}

export function topicApiId(topic: { id: string }): string {
  return topic.id
}

export function topicManagementHref(
  topic: TopicHrefInput,
  tab: TopicManagementTab = 'settings',
): string {
  return createTopicPathname(topic, `/${tab}`)
}

export function topicTagsHref(topic: TopicHrefInput, tagType: string): string {
  return createTopicPathname(topic, `/tags/${tagType}`)
}

export function postTagsHref(
  post: { post_type: PostType; id: string; slug?: string | null },
  tagType: string,
): string {
  return `/${getPostSlugFromType(post.post_type)}/${post.slug || post.id}/tags/${tagType}`
}

export function topicTabForPostType(postType: PostType | undefined): TopicTab | undefined {
  switch (postType) {
    case 'review': {
      return 'reviews'
    }
    case 'data_point': {
      return 'data-points'
    }
    case 'discussion':
    case 'story':
    case 'article':
    case 'blog_post': {
      return 'posts'
    }
    default: {
      return undefined
    }
  }
}
