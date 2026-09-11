import { topicTypes, type Topic, type TopicTypes } from '@/types/topics'
import type { Money } from '@ts-shared/money'

export type SpendingCategoryAttributes = {
  is_foreign_transaction: boolean
  default_spending_frequency: string | null
}

export interface TypeAttributes {
  bank_id?: string
  brand_id?: string
  rewards_program_id?: string
  referral_program_id?: string
  annual_fee?: Money | null
  company_id?: string
  lifetime_version_id?: string
  order_index?: number
}

/** Canonical list of topic-reference attribute fields — the single source of truth for the field set. */
export const topicIdFields = [
  'company_id',
  'bank_id',
  'brand_id',
  'rewards_program_id',
  'referral_program_id',
  'lifetime_version_id',
] as const

export type TopicIdField = (typeof topicIdFields)[number]

/**
 * Single source of truth for the topic-type filter applied to each reference field's
 * autocomplete. `null` = unfiltered (the backend only checks existence, not type — see
 * `assertTopicExists` in backend/services/topics/validation.mts). Non-null entries MUST
 * mirror the backend's type assertions (`assertRewardsProgramExists`, etc.). This is a UX
 * affordance, not a validation contract — do not hand-pass `topicTypes` at call sites.
 * Documented in docs/requirements/content/TOPICS.md § Reference fields.
 */
export const topicReferenceFieldTypes: Record<TopicIdField, TopicTypes[] | null> = {
  company_id: null,
  bank_id: null,
  brand_id: null,
  rewards_program_id: ['rewards_program'],
  referral_program_id: ['referral_program'],
  lifetime_version_id: ['rewards_program_status'],
}

/** Saved display names for topic-reference attributes, keyed by field, used to seed autocompletes. */
export type TypeAttributeNames = Partial<Record<TopicIdField, string>>

/**
 * Resolve the saved topic-reference ids in `attrs` to their topic names using the
 * provided per-id `lookupName` (server `getTopic` or client `fetchTopic`). Lookups run
 * in parallel; ids that fail to resolve or have no name are omitted from the result.
 */
export async function resolveTypeAttributeNames(
  attrs: TypeAttributes | null | undefined,
  lookupName: (topicId: string) => Promise<string | undefined>,
): Promise<TypeAttributeNames> {
  if (!attrs) return {}
  const lookups: Promise<readonly [TopicIdField, string | undefined]>[] = []
  for (const field of topicIdFields) {
    const topicId = attrs[field]
    if (!topicId) continue
    lookups.push(
      lookupName(topicId)
        .then(name => [field, name] as const)
        .catch(() => [field, undefined] as const),
    )
  }
  const names: TypeAttributeNames = {}
  for (const [field, name] of await Promise.all(lookups)) {
    if (name) names[field] = name
  }
  return names
}

export interface TopicEditState {
  basicSaving: boolean
  flagsSaving: boolean
  heroSaving: boolean
  isForeignTransaction: boolean
  loadError: string | null
  loading: boolean
  logoSaving: boolean
  spendingFrequency: string
  spendingSaving: boolean
  topic: Topic | null
  topicTypeValue: string
  typeAttrSaving: boolean
  typeAttributes: TypeAttributes | null
  typeAttributeNames: TypeAttributeNames
  typeSaving: boolean
}

export const initialTopicEditState: TopicEditState = {
  basicSaving: false,
  flagsSaving: false,
  heroSaving: false,
  isForeignTransaction: false,
  loadError: null,
  loading: true,
  logoSaving: false,
  spendingFrequency: '',
  spendingSaving: false,
  topic: null,
  topicTypeValue: '',
  typeAttrSaving: false,
  typeAttributes: null,
  typeAttributeNames: {},
  typeSaving: false,
}

export const validTopicTypeSlugs = new Set<string>(Object.values(topicTypes).map(t => t.slug))

export const typesWithAttributes = new Set([
  'card',
  'rewards_program',
  'referral_program',
  'rewards_program_status',
])
