import assert from 'http-assert'
import sql from 'sql-template-strings'
import { topicTypes } from '@voucha/types/entities/topic'
import { validateSlug } from '@modules/utils'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CreateTopicUpdates, Topic } from './types.mts'
import { assertValidTopicReferences } from './update-field-references.mts'

export function hasTopicFieldUpdates(changes: Partial<CreateTopicUpdates>): boolean {
  return (
    changes.name !== undefined ||
    changes.slug !== undefined ||
    changes.markdown !== undefined ||
    changes.topic_type !== undefined ||
    changes.noindex !== undefined ||
    changes.allow_reviews !== undefined ||
    changes.hostname !== undefined ||
    changes.homepage_url_id !== undefined ||
    changes.logo_image_id !== undefined ||
    changes.hero_image_id !== undefined ||
    changes.rewards_program_id !== undefined ||
    changes.referral_program_id !== undefined
  )
}

export async function assertValidTopicFieldUpdates(
  topic: Topic,
  changes: Partial<CreateTopicUpdates>,
  allowTypeChange: boolean,
  options: QueryOptions,
): Promise<void> {
  assertStringField(changes.name, 'Name must be a non-empty string')
  if (changes.slug !== undefined) {
    assertStringField(changes.slug, 'Slug must be a non-empty string')
    validateSlug(changes.slug)
  }
  if (changes.markdown !== undefined) {
    assert(
      changes.markdown === null || typeof changes.markdown === 'string',
      422,
      'Markdown must be a string',
    )
  }
  if (changes.topic_type !== undefined && changes.topic_type !== topic.topic_type) {
    assert(topicTypes[changes.topic_type], 422, `Invalid topic type: ${changes.topic_type}`)
    assert(
      allowTypeChange || topic.topic_type !== 'rss_feed',
      400,
      'Cannot change topic type for source topics',
    )
    assert(
      allowTypeChange || changes.topic_type !== 'rss_feed',
      422,
      'Source topics can only be created by ingesting a URL',
    )
  }
  assertBooleanField(changes.noindex, 'noindex must be a boolean')
  assertBooleanField(changes.allow_reviews, 'allow_reviews must be a boolean')
  await assertValidTopicReferences(changes, options)
}

export function appendTopicUpdateFields(
  updateQuery: ReturnType<typeof sql>,
  changes: Partial<CreateTopicUpdates>,
): void {
  appendIfDefined(updateQuery, changes.name, value => sql`, name = ${value}`)
  appendIfDefined(updateQuery, changes.slug, value => sql`, slug = ${value}`)
  appendIfDefined(updateQuery, changes.markdown, value => sql`, markdown = ${value}`)
  appendIfDefined(updateQuery, changes.topic_type, value => sql`, topic_type = ${value}`)
  appendIfDefined(updateQuery, changes.noindex, value => sql`, noindex = ${value}`)
  appendIfDefined(updateQuery, changes.allow_reviews, value => sql`, allow_reviews = ${value}`)
  appendIfDefined(updateQuery, changes.homepage_url_id, value => sql`, homepage_url_id = ${value}`)
  appendIfDefined(updateQuery, changes.logo_image_id, value => sql`, logo_image_id = ${value}`)
  appendIfDefined(updateQuery, changes.hero_image_id, value => sql`, hero_image_id = ${value}`)
  appendIfDefined(
    updateQuery,
    changes.rewards_program_id,
    value => sql`, rewards_program_id = ${value}`,
  )
  appendIfDefined(
    updateQuery,
    changes.referral_program_id,
    value => sql`, referral_program_id = ${value}`,
  )
}

function assertStringField(value: unknown, message: string): void {
  if (value === undefined) return
  assert(typeof value === 'string' && value.trim().length > 0, 422, message)
}

function assertBooleanField(value: unknown, message: string): void {
  if (value === undefined) return
  assert(typeof value === 'boolean', 422, message)
}

function appendIfDefined<T>(
  updateQuery: ReturnType<typeof sql>,
  value: T | undefined,
  build: (value: T) => ReturnType<typeof sql>,
): void {
  if (value !== undefined) updateQuery.append(build(value))
}
