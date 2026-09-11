import { createHash } from 'node:crypto'
import type { BasicUser } from './user.mts'

type TopicTypeConfig = {
  slug: string // e.g. /<slug>/<topic.id>
  slugPlural: string // e.g. /<slugPlural>?q=<topic.name>
  sitemap: boolean // whether to include this topic type in the sitemap
  topic_type?: string // the topic type to match on topic.topic_type
}

export type TopicTypes = keyof typeof topicTypes

// Mutually exclusive topic types. Every type here must justify itself with functional
// behavior (a 1:1 extension table, type-specific validation, or type-specific routing/SEO).
// A type that would differ only by URL slug or sitemap membership must NOT exist — use the
// default `topic` instead. See docs/requirements/content/TOPICS.md.
export const topicTypes = {
  topic: {
    // default type
    slug: 'topic',
    slugPlural: 'topics',
    sitemap: true,
  },
  rewards_program: {
    slug: 'rewards-program',
    slugPlural: 'rewards-programs',
    sitemap: true,
    topic_type: 'rewards_program',
  },
  rewards_program_status: {
    slug: 'rewards-program-status',
    slugPlural: 'rewards-program-statuses',
    sitemap: true,
    topic_type: 'rewards_program_status',
  },
  referral_program: {
    slug: 'referral-program',
    slugPlural: 'referral-programs',
    sitemap: true,
    topic_type: 'referral_program',
  },
  card: {
    slug: 'card',
    slugPlural: 'cards',
    sitemap: true,
    topic_type: 'card',
  },
  bank_account: {
    slug: 'bank-account',
    slugPlural: 'bank-accounts',
    sitemap: true,
    topic_type: 'bank_account',
  },
  rss_feed: {
    slug: 'source',
    slugPlural: 'sources',
    sitemap: true,
    topic_type: 'rss_feed',
  },
  fediverse_instance: {
    slug: 'instance',
    slugPlural: 'instances',
    sitemap: true,
    topic_type: 'fediverse_instance',
  },
} as const satisfies Record<string, TopicTypeConfig>

export function getTopicTypeSlug(topicType: string) {
  return topicTypes[topicType as TopicTypes]?.slug ?? topicType
}

export function getTopicTypeSlugPlural(topicType: string) {
  return topicTypes[topicType as TopicTypes]?.slugPlural ?? `${topicType}s`
}

export function getTopicTypeFromSlug(slug: string): TopicTypes | undefined {
  const entry = Object.entries(topicTypes).find(([, v]) => v.slug === slug)
  return entry?.[0] as TopicTypes | undefined
}

type PublicViewHostname = {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
}

type TopicBasic = {
  __entity_type: 'topic'
  id: string
  name: string
  slug: string
  markdown: string
  html?: string
  aliases: string[]
  topic_type: TopicTypes
  noindex: boolean
  allow_reviews: boolean
  created_at: Date
  hostname_id: string | null
  hostname?: PublicViewHostname | null
  homepage_url_id: string | null
  logo_image_id: string | null
  hero_image_id: string | null
  rewards_program_id: string | null
  referral_program_id: string | null
  referral_program_slug?: string | null
  lingua_rs_detected_language?: string | null
}

export type Topic = TopicBasic & {
  created_by: BasicUser
  updated_by: BasicUser
}

export type TopicMetrics = {
  __entity_type: 'topic_metrics'
  id: string
  count: {
    discussions: number
    reviews: number
    'data-points': number
    news: number
    latest: number
  }
  viewer_count?: {
    discussions: number
    reviews: number
    'data-points': number
  }
  ratings: {
    count: {
      '1': number
      '2': number
      '3': number
      '4': number
      '5': number
    }
  }
  ratings__updated_at: Date
  bookmarks: {
    follow: number
  }
  bookmarks__updated_at: Date
}

export type TopicRatingStats = {
  ratings__score__1: number
  ratings__score__2: number
  ratings__score__3: number
  ratings__score__4: number
  ratings__score__5: number
  ratings__count__1: number
  ratings__count__2: number
  ratings__count__3: number
  ratings__count__4: number
  ratings__count__5: number
}

export type TopicElection = {
  __entity_type: 'topic_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

// Pure content-hashing helper (no service dependencies) so that
// backend/services/bedrock-embeddings can compute topic embedding content without
// depending on @services/topics. Avoid a @modules/utils dependency here (it already
// depends on @voucha/types) by hashing directly with node:crypto.
export function createTopicEmbeddingContent(
  topic: Topic | { name: string; markdown?: string; aliases?: string[] },
): { content: string; content_sha256: Buffer } {
  const aliases = topic.aliases ?? []
  const content = `${topic.name}\n${aliases.join(' ')}\n${topic.markdown || ''}`
  return {
    content,
    content_sha256: createHash('sha256').update(content).digest(),
  }
}
