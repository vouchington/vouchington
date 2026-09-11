import assert from 'http-assert'
import { countWords } from '@ts-shared/utils/text-metrics'
import { validateCommunitySlug } from './slugs.mts'
import type { CreateCommunityInput } from './create.mts'

export function validateCreateCommunityInput(input: CreateCommunityInput): void {
  assert(input.name, 422, 'Name is required')
  assert(input.name.trim() === input.name, 422, 'Name must not have leading or trailing whitespace')
  const name = input.name
  assert(name.length >= 1 && name.length <= 100, 422, 'Name must be between 1 and 100 characters')
  assert(countWords(name) >= 3, 422, 'Community name must have at least 3 words')
  if (input.slug) validateCommunitySlug(input.slug)
  assert(
    input.allow_review_posts === undefined || typeof input.allow_review_posts === 'boolean',
    422,
    'allow_review_posts must be boolean',
  )
  assert(
    input.allow_data_point_posts === undefined || typeof input.allow_data_point_posts === 'boolean',
    422,
    'allow_data_point_posts must be boolean',
  )
  assert(
    input.default_language == null || typeof input.default_language === 'string',
    422,
    'default_language must be a string or null',
  )
}
