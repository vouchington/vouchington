import { createEmbeddingDocumentHash } from '../embedding-content.mts'
import type { PublicContentProvenance, StaffContentProvenance } from './content-provenance.mts'
import type { BasicUser, ImagePlacementTuple } from './user.mts'

export type { TopicMetrics, TopicRatingStats } from './topic-metrics.mts'

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
  is_noindexed: boolean
  should_allow_reviews: boolean
  created_at: Date
  hostname_id: string | null
  hostname?: PublicViewHostname | null
  homepage_url_id: string | null
  logo_image_id: string | null
  hero_image_id: string | null
  logo_image_placement?: ImagePlacementTuple | null
  hero_image_placement?: ImagePlacementTuple | null
  rewards_program_id: string | null
  referral_program_id: string | null
  referral_program_slug?: string | null
  lingua_rs_detected_language?: string | null
  // Attached per request after the cache read, never stored on the cached topic or in a view.
  provenance?: PublicContentProvenance
  staff_provenance?: StaffContentProvenance
}

export type Topic = TopicBasic & {
  created_by: BasicUser | null
  updated_by: BasicUser | null
}

export type TopicElection = {
  __entity_type: 'topic_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

// Pure content-hashing helper (no service dependencies) so that
// backend/services/embeddings can compute topic embedding content without
// depending on @services/topics. Avoid a @modules/utils dependency here (it already
// depends on @voucha/types) by hashing directly with node:crypto.
export function createTopicEmbeddingContent(
  topic: Topic | { name: string; markdown?: string; aliases?: string[] },
): { title: string; body: string; content: string; content_sha256: Buffer } {
  const aliases = [...new Set((topic.aliases ?? []).map(alias => alias.toWellFormed()))].toSorted()
  const title = topic.name
  const body = `${aliases.join(' ')}\n${topic.markdown || ''}`
  const content = `${title}\n${body}`
  return {
    title,
    body,
    content,
    content_sha256: createEmbeddingDocumentHash(body, title),
  }
}
