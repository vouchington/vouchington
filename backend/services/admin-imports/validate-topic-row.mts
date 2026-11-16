import { isSlug } from '@modules/utils'
import { topicTypes } from '@voucha/types/entities/topic'
import {
  validateReferralFields,
  validateReferralUrlFields,
} from './validate-topic-row-referral.mts'
import { validateRssFeedFields } from './validate-topic-row-rss-feed.mts'

const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])
// Bounds the single parent-relation upsert processTopicParentRelations makes per row.
const MAX_PARENT_SLUGS_PER_ROW = 20

export type TopicRowValidationContext = {
  isDuplicateSlug: boolean
  isDuplicateReferralValidationSlug: boolean
}

/** The slug a row claims in the batch, or undefined when it cannot claim one. */
export function claimedTopicSlug(row: Record<string, string>): string | undefined {
  const slug = row.slug?.trim()
  return slug && isSlug(slug) ? slug : undefined
}

export function validateTopicRow(
  row: Record<string, string>,
  context: TopicRowValidationContext,
): string[] {
  return [
    ...validateSlug(row, context.isDuplicateSlug),
    ...validateBasicFields(row),
    ...validateReferralUrlFields(row),
    ...validateRssFeedFields(row),
    ...validateExtensions(row),
    ...validateParentSlugs(row),
    ...validateReferralFields(row, context.isDuplicateReferralValidationSlug),
  ]
}

function validateSlug(row: Record<string, string>, isDuplicateSlug: boolean): string[] {
  const slug = row.slug?.trim()
  if (!slug) return ['slug is required']
  if (!isSlug(slug)) return ['slug must only contain lowercase letters, numbers, and hyphens']
  return isDuplicateSlug ? [`slug "${slug}" is duplicated in this batch`] : []
}

function validateBasicFields(row: Record<string, string>): string[] {
  const name = row.name?.trim()
  const topicType = row.topic_type?.trim()
  return [
    ...(name !== undefined && name !== '' && name.length > 200
      ? ['name must be at most 200 characters']
      : []),
    ...(topicType && !Object.hasOwn(topicTypes, topicType)
      ? [`topic_type must be one of: ${Object.keys(topicTypes).join(', ')}`]
      : topicType === 'fediverse_instance'
        ? // Unlike rss_feed (see validate-topic-row-rss-feed.mts + process-topic-row-rss-feed.mts),
          // there is no importer-side step that resolves a hostname or classifies the instance —
          // processTopicRow would insert a bare topic row with no fediverse_instances extension row or
          // hostname_id, breaking find-existing-instance.mts and the instance directory. Instance
          // topics can only be created through POST /api/v1/fediverse/instances.
          ['topic_type=fediverse_instance is not supported by CSV import']
        : []),
  ]
}

function validateExtensions(row: Record<string, string>): string[] {
  const extensions = row.extensions?.trim()
  if (!extensions) return []
  const extList = extensions.split('|').flatMap(e => (e.trim() ? [e.trim()] : []))
  return extList.flatMap(ext =>
    VALID_EXTENSIONS.has(ext)
      ? []
      : [
          `extensions contains invalid value "${ext}"; must be one of: ${[...VALID_EXTENSIONS].join(', ')}`,
        ],
  )
}

function validateParentSlugs(row: Record<string, string>): string[] {
  const parentSlugs = row.parent_slugs?.split('|').filter(slug => slug.trim()) ?? []
  return parentSlugs.length > MAX_PARENT_SLUGS_PER_ROW
    ? [`parent_slugs must contain at most ${MAX_PARENT_SLUGS_PER_ROW} slugs`]
    : []
}
