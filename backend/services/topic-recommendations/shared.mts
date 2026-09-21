import assert from 'http-assert'
import { validateSlug } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import type { CreateTopicRecommendationInput, TopicRecommendationFieldsInput } from './types.mts'
import { normalizeUrlArray } from './shared-typed-fields.mts'
import { normalizeHostnames, normalizeStringArray } from './shared-normalize.mts'
import { assertValidTopicRecommendationInput } from './shared-validation.mts'
export { assertValidTopicRecommendationInput } from './shared-validation.mts'

export function buildTopicRecommendationFields(input: TopicRecommendationFieldsInput) {
  const topic_markdown = input.topic_markdown?.trim() || null
  const rawHostname = input.topic_hostname?.trim() || null
  const topic_hostname = rawHostname ? normalizeHostname(rawHostname) : null
  assert(!rawHostname || topic_hostname !== null, 422, `Invalid hostname: ${input.topic_hostname}`)
  const topic_hostnames = normalizeHostnames([
    ...(topic_hostname ? [topic_hostname] : []),
    ...(input.topic_hostnames ?? []),
  ])
  const topic_aliases = normalizeStringArray(input.topic_aliases, { lower: true })
  const topic_type = input.topic_type ?? 'topic'
  // Clear type-specific fields when they don't apply to the current topic_type
  // to prevent orphaned values when topic_type changes on update.
  const example_referral_link =
    topic_type === 'referral_program' ? input.example_referral_link?.trim() || null : null
  const landing_page_urls = topic_type === 'card' ? normalizeUrlArray(input.landing_page_urls) : []

  return {
    topic_markdown,
    topic_hostname,
    topic_hostnames,
    topic_aliases,
    topic_type,
    example_referral_link,
    landing_page_urls,
  }
}

type TopicRecommendationValuesInput = {
  title?: string | null
  markdown?: string | null
  topic_title?: string | null
  topic_slug?: string | null
} & TopicRecommendationFieldsInput

export function normalizeTopicRecommendationValues(input: TopicRecommendationValuesInput) {
  const title = input.title?.trim() || ''
  const markdown = input.markdown?.trim() || ''
  const topic_title = input.topic_title?.trim() || ''
  const topic_slug = input.topic_slug?.trim().toLowerCase() || ''

  assert(markdown.length > 0, 422, 'Markdown is required')
  assert(topic_title.length > 0, 422, 'Topic title is required')
  assert(topic_slug.length > 0, 422, 'Topic slug is required')
  validateSlug(topic_slug)

  const fields = buildTopicRecommendationFields(input)

  if (fields.topic_type === 'referral_program') {
    assert(
      fields.example_referral_link !== null && fields.example_referral_link.length > 0,
      422,
      'example_referral_link is required for referral_program topics',
    )
  }
  if (fields.topic_type === 'card') {
    assert(
      fields.landing_page_urls.length >= 1,
      422,
      'landing_page_urls must have at least one entry for card topics',
    )
  }

  return {
    title,
    markdown,
    topic_title,
    topic_slug,
    ...fields,
  }
}

export function assertValidCreateTopicRecommendationInput(
  input: unknown,
): asserts input is CreateTopicRecommendationInput {
  assert(
    typeof input === 'object' && input !== null && !Array.isArray(input),
    422,
    'Request body must be an object',
  )
  const typedInput = input as CreateTopicRecommendationInput
  assertValidTopicRecommendationInput(typedInput)
  normalizeTopicRecommendationValues(typedInput)
}
