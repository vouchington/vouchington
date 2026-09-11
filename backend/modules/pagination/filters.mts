/**
 * Shared filter validators for pagination
 * Extracted and consolidated from api-query-parsers
 */

import type { PostType } from '@voucha/types/entities/post'
import type { TopicTypes } from '@voucha/types/entities/topic'
import { VALID_TIME_RANGES, type TimeRange } from '@voucha/types/feed'
import { VALID_FILTERABLE_POST_TYPES, isCatalogValue } from '@ts-shared/feed-capabilities'
import { parseStringArray } from '@ts-shared/utils/query'

// User-filterable post types supported by the ?post_types= query parameter.
// Excludes internal/system types (topic_recommendation, etc.)
// that are not valid filter values for the public API.
export const VALID_POST_TYPES = VALID_FILTERABLE_POST_TYPES satisfies ReadonlyArray<PostType>

export const VALID_TOPIC_TYPES = [
  'topic',
  'rewards_program',
  'rewards_program_status',
  'referral_program',
  'card',
] as const satisfies ReadonlyArray<TopicTypes>

/**
 * Validate and parse post types from the ?post_types= query parameter.
 * Only accepts the user-filterable subset of PostType (see VALID_POST_TYPES above).
 * @param value - Raw query parameter value
 * @returns Array of allowed post_types filter values, or undefined if none valid
 */
export function validatePostTypes(value: unknown): PostType[] | undefined {
  if (!value) return undefined

  const types = parseStringArray(value)
  const validTypes = types.filter((type): type is PostType =>
    isCatalogValue(VALID_POST_TYPES, type),
  )

  return validTypes.length > 0 ? validTypes : undefined
}

/**
 * Validate and parse topic types from query parameter
 * @param value - Raw query parameter value
 * @returns Array of valid TopicTypes values, or undefined if none valid
 */
export function validateTopicTypes(value: unknown): TopicTypes[] | undefined {
  if (!value) return undefined

  const types = parseStringArray(value)
  const validTypes: TopicTypes[] = []

  for (const type of types) {
    if (isCatalogValue(VALID_TOPIC_TYPES, type)) validTypes.push(type)
  }

  return validTypes.length > 0 ? validTypes : undefined
}

/**
 * Validate time range parameter
 * @param value - Raw query parameter value
 * @returns Valid TimeRange value, or undefined if invalid
 */
export function validateTimeRange(value: unknown): TimeRange | undefined {
  if (typeof value !== 'string') return undefined
  return isCatalogValue(VALID_TIME_RANGES, value) ? value : undefined
}

/**
 * Validate sort parameter against allowed values
 * @param value - Raw query parameter value
 * @param allowedValues - Array of allowed sort values
 * @returns Valid sort value, or undefined if invalid
 */
export function validateSort(value: unknown, allowedValues: readonly string[]): string | undefined {
  if (typeof value !== 'string') return undefined
  return allowedValues.includes(value) ? value : undefined
}

export const VALID_MEDIA_TYPES = ['article', 'audio', 'video'] as const
export type MediaType = (typeof VALID_MEDIA_TYPES)[number]

/**
 * Validate and parse media types from media_type / media_types query parameters.
 * Accepts both singular `?media_type=audio` and plural `?media_types=audio,video`.
 * @returns Deduplicated array of valid MediaType values, or undefined if none valid
 */
export function validateMediaTypes(single: unknown, multi: unknown): MediaType[] | undefined {
  const raw: unknown[] = []
  if (single !== undefined) {
    if (Array.isArray(single)) {
      raw.push(...single)
    } else if (typeof single === 'string') {
      // Support comma-separated values in the singular param (e.g. ?media_type=audio,video)
      raw.push(...single.split(',').map(v => v.trim()))
    }
  }
  if (multi !== undefined) {
    if (Array.isArray(multi)) {
      raw.push(...multi)
    } else if (typeof multi === 'string') {
      raw.push(...multi.split(',').map(v => v.trim()))
    }
  }
  const valid = raw.filter(
    (t): t is MediaType =>
      typeof t === 'string' && (VALID_MEDIA_TYPES as readonly string[]).includes(t),
  )
  return valid.length > 0 ? [...new Set(valid)] : undefined
}
