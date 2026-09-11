import { isSlug } from '@modules/utils'
import { topicTypes } from '@voucha/types/entities/topic'
import {
  validateReferralFields,
  validateReferralUrlFields,
} from './validate-topic-row-referral.mts'
import { validateRssFeedFields } from './validate-topic-row-rss-feed.mts'

const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])

export type TopicRowValidationContext = {
  seenSlugs: Set<string>
  seenReferralValidationSlugs: Set<string>
}

export function validateTopicRow(
  row: Record<string, string>,
  context: TopicRowValidationContext,
): string[] {
  const errors: string[] = []
  validateSlug(row, errors, context.seenSlugs)
  validateBasicFields(row, errors)
  validateReferralUrlFields(row, errors)
  validateRssFeedFields(row, errors)
  validateExtensions(row, errors)
  validateReferralFields(row, errors, context.seenReferralValidationSlugs)
  return errors
}

function validateSlug(row: Record<string, string>, errors: string[], seenSlugs: Set<string>): void {
  const slug = row.slug?.trim()
  if (!slug) {
    errors.push('slug is required')
  } else if (!isSlug(slug)) {
    errors.push('slug must only contain lowercase letters, numbers, and hyphens')
  } else if (seenSlugs.has(slug)) {
    errors.push(`slug "${slug}" is duplicated in this batch`)
  } else {
    seenSlugs.add(slug)
  }
}

function validateBasicFields(row: Record<string, string>, errors: string[]): void {
  const name = row.name?.trim()
  if (name !== undefined && name !== '' && name.length > 200) {
    errors.push('name must be at most 200 characters')
  }
  const topicType = row.topic_type?.trim()
  if (topicType && !Object.hasOwn(topicTypes, topicType)) {
    errors.push(`topic_type must be one of: ${Object.keys(topicTypes).join(', ')}`)
  } else if (topicType === 'fediverse_instance') {
    // Unlike rss_feed (see validate-topic-row-rss-feed.mts + process-topic-row-rss-feed.mts),
    // there is no importer-side step that resolves a hostname or classifies the instance —
    // processTopicRow would insert a bare topic row with no fediverse_instances extension row or
    // hostname_id, breaking find-existing-instance.mts and the instance directory. Instance
    // topics can only be created through POST /api/v1/fediverse/instances.
    errors.push('topic_type=fediverse_instance is not supported by CSV import')
  }
}

function validateExtensions(row: Record<string, string>, errors: string[]): void {
  const extensions = row.extensions?.trim()
  if (!extensions) return
  const extList = extensions.split('|').flatMap(e => (e.trim() ? [e.trim()] : []))
  for (const ext of extList) {
    if (!VALID_EXTENSIONS.has(ext)) {
      errors.push(
        `extensions contains invalid value "${ext}"; must be one of: ${[...VALID_EXTENSIONS].join(', ')}`,
      )
    }
  }
}
