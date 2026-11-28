import { isUUID } from '@modules/utils'
import { assertTopicHasHostname } from '@services/topics/hostname-link'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'
import type { RssFeedStateChange } from './update-state-helpers.mts'
import type { UpdateRssFeedChanges, UpdateRssFeedOptions } from './update-types.mts'
import { isPublicRssFeedUrl } from './url-validation.mts'

type Sets = ReturnType<typeof sql>[]

export async function buildRssFeedUpdateFields(
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<{ sets: Sets; stateChanges: RssFeedStateChange[] }> {
  const urlSets = await buildUrlSets(changes, options)
  const topicSets = await buildTopicSets(changes, options)
  const titleSets = buildTitleSets(changes)
  const timestampSets = buildTimestampSets(changes)
  const sets = [
    ...urlSets,
    ...topicSets,
    ...titleSets,
    ...('etag' in changes ? [sql`etag = ${changes.etag}`] : []),
    ...timestampSets,
    ...(changes.feed_type === undefined ? [] : [sql`feed_type = ${changes.feed_type}`]),
    ...(changes.declared_language === undefined
      ? []
      : [sql`declared_language = ${changes.declared_language ?? null}`]),
    ...(changes.should_ignore_robots_txt === undefined
      ? []
      : [sql`should_ignore_robots_txt = ${changes.should_ignore_robots_txt}`]),
    ...(changes.unreliable_status_codes === undefined
      ? []
      : [sql`unreliable_status_codes = ${changes.unreliable_status_codes}`]),
  ]
  const stateChanges: RssFeedStateChange[] = [
    ...(changes.is_enabled === undefined
      ? []
      : [{ kind: 'enablement' as const, is_enabled: changes.is_enabled }]),
    ...(changes.discoverable === undefined
      ? []
      : [{ kind: 'discoverability' as const, is_enabled: changes.discoverable }]),
  ]

  return { sets, stateChanges }
}

async function buildUrlSets(
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<Sets> {
  if (changes.rss_feed_url === undefined) return []
  assert(
    isPublicRssFeedUrl(changes.rss_feed_url),
    400,
    'rss_feed_url must be a public http(s) URL without a fragment',
  )
  const rssFeedUrlId = await createRssFeedUrlId(changes.rss_feed_url, options)
  return [sql`rss_feed_url_id = ${rssFeedUrlId}`]
}

async function buildTopicSets(
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<Sets> {
  if (changes.topic_id === undefined) return []
  assert(isUUID(changes.topic_id), 400, 'topic_id must be a valid UUID')
  await assertTopicHasHostname(changes.topic_id, options)
  return [sql`topic_id = ${changes.topic_id}`]
}

function buildTitleSets(changes: UpdateRssFeedChanges): Sets {
  if (!('title' in changes)) return []
  assert(
    changes.title === null || typeof changes.title === 'string',
    400,
    'title must be a string or null',
  )
  const normalizedTitle = typeof changes.title === 'string' ? changes.title.trim() : null
  assert(normalizedTitle !== '', 400, 'title must not be empty; set to null to clear')
  return [sql`title = ${normalizedTitle}`]
}

function buildTimestampSets(changes: UpdateRssFeedChanges): Sets {
  return 'last_modified_at' in changes ? [normalizeLastModifiedAt(changes.last_modified_at)] : []
}

function normalizeLastModifiedAt(value: UpdateRssFeedChanges['last_modified_at']) {
  if (value === true) return sql`last_modified_at = CURRENT_TIMESTAMP`
  if (value instanceof Date) return sql`last_modified_at = ${value}`
  if (value === null) return sql`last_modified_at = NULL`
  throw new TypeError('last_modified_at must be a date, true, or null')
}
