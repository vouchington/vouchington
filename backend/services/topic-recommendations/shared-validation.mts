import assert from 'http-assert'
import { validateSlug } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import type { CreateTopicRecommendationInput, UpdateTopicRecommendationInput } from './types.mts'
import { assertValidTypedTopicFields } from './shared-typed-fields.mts'
import { normalizeHostnames } from './shared-normalize.mts'

export function assertValidTopicRecommendationInput(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  assertOptionalString(input, 'title', 'Title must be a string')
  assertRequiredTrimmedString(input, 'markdown', 'Markdown is required')
  assertRequiredTrimmedString(input, 'topic_title', 'Topic title is required')
  assertTopicSlug(input)
  assertOptionalString(input, 'topic_markdown', 'Topic markdown must be a string')
  assertTopicHostname(input)
  assertTopicHostnames(input)
  assertTopicAliases(input)
  assertValidTypedTopicFields(input)
}

function assertOptionalString(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
  field: 'title' | 'topic_markdown',
  message: string,
): void {
  if (field in input && input[field] !== undefined) {
    assert(typeof input[field] === 'string', 422, message)
  }
}

function assertRequiredTrimmedString(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
  field: 'markdown' | 'topic_title',
  message: string,
): void {
  if (field in input && input[field] !== undefined) {
    assert(typeof input[field] === 'string' && input[field].trim().length > 0, 422, message)
  }
}

function assertTopicSlug(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  if (!('topic_slug' in input) || input.topic_slug === undefined) return
  assert(
    typeof input.topic_slug === 'string' && input.topic_slug.trim().length > 0,
    422,
    'Topic slug is required',
  )
  validateSlug(input.topic_slug.trim().toLowerCase())
}

function assertTopicHostname(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  if (!('topic_hostname' in input) || input.topic_hostname === undefined) return
  assert(
    typeof input.topic_hostname === 'string' && normalizeHostname(input.topic_hostname) !== null,
    422,
    'Topic hostname must be a valid hostname',
  )
}

function assertTopicHostnames(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  if (!('topic_hostnames' in input) || input.topic_hostnames === undefined) return
  assert(Array.isArray(input.topic_hostnames), 422, 'Topic hostnames must be an array')
  assert(
    input.topic_hostnames.every(hostname => typeof hostname === 'string'),
    422,
    'Topic hostnames must be an array of strings',
  )
  normalizeHostnames(input.topic_hostnames)
}

function assertTopicAliases(
  input: CreateTopicRecommendationInput | UpdateTopicRecommendationInput,
): void {
  if (!('topic_aliases' in input) || input.topic_aliases === undefined) return
  assert(Array.isArray(input.topic_aliases), 422, 'Topic aliases must be an array')
  assert(
    input.topic_aliases.every(alias => typeof alias === 'string'),
    422,
    'Topic aliases must be an array of strings',
  )
}
