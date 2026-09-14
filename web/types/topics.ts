/**
 * Topic types for frontend rendering.
 *
 * Enums and simple types are derived from the canonical backend definitions
 * in backend/types/entities/topic.mts. Runtime values (topicTypes, helpers)
 * are kept as local copies since static analysis prohibits non-index re-exports.
 * Composite entity types (Topic) remain local because the API response shape
 * differs from the backend entity type (e.g. BasicUser for created_by/updated_by).
 */

import type { Serialized } from '@voucha/types/serialized'
import type {
  TopicTypes,
  TopicElection,
  TopicMetrics as BackendTopicMetrics,
} from '@voucha/types/entities/topic'
import type { MessageKey } from '@ts-shared/ui-messages'

// Re-export types from canonical backend definitions
export type { TopicTypes, TopicElection }

// Runtime config — slug fields mirror backend/types/entities/topic.mts; label is a MessageKey
// resolved via t() at the consuming component/route factory.
interface TopicTypeConfig {
  label: MessageKey
  slug: string
  slugPlural: string
  sitemap: boolean
  topic_type?: string
}

export const topicTypes = {
  topic: {
    label: 'extracted.topicRecommendations.topicTypeSelectField.topic_7e61847d',
    slug: 'topic',
    slugPlural: 'topics',
    sitemap: true,
  },
  rewards_program: {
    label: 'extracted.settings.typeAttributesFields.rewardsProgram_f76a1d04',
    slug: 'rewards-program',
    slugPlural: 'rewards-programs',
    sitemap: true,
    topic_type: 'rewards_program',
  },
  rewards_program_status: {
    label: 'extracted.topics.topicTypes.rewardsProgramStatus_8a03e8a4',
    slug: 'rewards-program-status',
    slugPlural: 'rewards-program-statuses',
    sitemap: true,
    topic_type: 'rewards_program_status',
  },
  referral_program: {
    label: 'extracted.topicRecommendations.topicTypeSelectField.referralProgram_c4f204bd',
    slug: 'referral-program',
    slugPlural: 'referral-programs',
    sitemap: true,
    topic_type: 'referral_program',
  },
  card: {
    label: 'extracted.topicRecommendations.topicTypeSelectField.card_be3702e3',
    slug: 'card',
    slugPlural: 'cards',
    sitemap: true,
    topic_type: 'card',
  },
  bank_account: {
    label: 'extracted.posts.dataPointFields.bankAccount_c6f645d8',
    slug: 'bank-account',
    slugPlural: 'bank-accounts',
    sitemap: true,
    topic_type: 'bank_account',
  },
  rss_feed: {
    label: 'extracted.topics.topicSourcesAside.source_0e570ca6',
    slug: 'source',
    slugPlural: 'sources',
    sitemap: true,
    topic_type: 'rss_feed',
  },
  fediverse_instance: {
    label: 'extracted.topics.topicTypes.instance_425f2336',
    slug: 'instance',
    slugPlural: 'instances',
    sitemap: true,
    topic_type: 'fediverse_instance',
  },
} as const satisfies Record<string, TopicTypeConfig>

export interface TopicTypeOption {
  value: TopicTypes
  label: MessageKey
}

export const TOPIC_TYPE_OPTIONS: TopicTypeOption[] = (
  Object.entries(topicTypes) as [TopicTypes, TopicTypeConfig][]
).map(([value, config]) => ({
  value,
  label: config.label,
}))

// rss_feed and fediverse_instance topics are both auto-created by their respective ingestion
// pipelines (RSS crawler, fediverse instance directory), not manually assignable by users.
export const NON_SOURCE_TOPIC_TYPE_OPTIONS: TopicTypeOption[] = TOPIC_TYPE_OPTIONS.filter(
  opt => opt.value !== 'rss_feed' && opt.value !== 'fediverse_instance',
)

export function getTopicTypeLabel(topicType: string): MessageKey {
  return topicTypes[topicType as TopicTypes]?.label ?? topicTypes.topic.label
}

export function getTopicTypeSlug(topicType: string) {
  return topicTypes[topicType as TopicTypes]?.slug ?? topicType
}

export function getTopicTypeFromSlug(slug: string): TopicTypes | undefined {
  const entry = Object.entries(topicTypes).find(([, v]) => v.slug === slug)
  return entry?.[0] as TopicTypes | undefined
}

export function getTopicTypeLabelFromSlug(slug: string): MessageKey {
  const topicType = getTopicTypeFromSlug(slug)
  return topicType ? getTopicTypeLabel(topicType) : topicTypes.topic.label
}

// Types with Date→string conversion
export type TopicMetrics = Serialized<BackendTopicMetrics>

export interface BasicUser {
  id: string
  username?: string | null
  display_name?: string | null
  display_name_url_id?: string | null
  is_official_account?: boolean
  display_account?: { id?: string; name: string | null } | null
}

interface TopicHostname {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
}

interface TopicBasic {
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
  created_at: string
  hostname_id?: string | null
  hostname?: TopicHostname | null
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

export interface TopicContentUpdate {
  updated_at: string
  updated_by: BasicUser
}

// API response search result — differs from internal backend search result
export interface TopicSearchResult {
  __entity_type: 'topic'
  id: string
  ranking?: number
  name: string
  slug: string
  topic_type: TopicTypes
}
