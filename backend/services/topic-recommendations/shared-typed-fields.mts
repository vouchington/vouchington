import assert from 'http-assert'
import { URL } from 'node:url'
import type { CreateTopicRecommendationInput, UpdateTopicRecommendationInput } from './types.mts'

export const VALID_TOPIC_TYPES = ['topic', 'referral_program', 'card'] as const

export function assertValidUrl(value: string, fieldName: string): void {
  try {
    const parsed = new URL(value)
    assert(
      parsed.protocol === 'https:' || parsed.protocol === 'http:',
      422,
      `${fieldName} must be a valid URL`,
    )
  } catch {
    assert(false, 422, `${fieldName} must be a valid URL`)
  }
}

export function normalizeUrlArray(values: string[] | undefined): string[] {
  if (!values) return []
  const normalized = values.flatMap(value => {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  })
  return [...new Set(normalized)]
}

export function assertValidTypedTopicFields(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  if ('topic_type' in input && input.topic_type !== undefined) {
    assert(
      (VALID_TOPIC_TYPES as readonly string[]).includes(input.topic_type),
      422,
      `topic_type must be one of: ${VALID_TOPIC_TYPES.join(', ')}`,
    )
  }
  if ('example_referral_link' in input && input.example_referral_link !== undefined) {
    assert(
      typeof input.example_referral_link === 'string' &&
        input.example_referral_link.trim().length > 0,
      422,
      'example_referral_link must be a non-empty string',
    )
    assertValidUrl(input.example_referral_link.trim(), 'example_referral_link')
  }
  if ('landing_page_urls' in input && input.landing_page_urls !== undefined) {
    assert(Array.isArray(input.landing_page_urls), 422, 'landing_page_urls must be an array')
    assert(
      input.landing_page_urls.every(url => typeof url === 'string' && url.trim().length > 0),
      422,
      'landing_page_urls must be an array of non-empty strings',
    )
    for (const url of input.landing_page_urls) {
      assertValidUrl(url.trim(), 'landing_page_urls entry')
    }
  }
}
