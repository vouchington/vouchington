import { isUUID } from '@modules/utils'
import { assertTopicHasHostname } from '@services/topics/hostname-link'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'
import type { RssFeedStateChange } from './update-state-helpers.mts'
import type { UpdateRssFeedChanges, UpdateRssFeedOptions } from './update.mts'
import { isPublicRssFeedUrl } from './url-validation.mts'

export async function buildRssFeedUpdateFields(
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<{ sets: ReturnType<typeof sql>[]; stateChanges: RssFeedStateChange[] }> {
  const sets: ReturnType<typeof sql>[] = []
  const stateChanges: RssFeedStateChange[] = []

  await appendUrlSet(sets, changes, options)
  await appendTopicSet(sets, changes, options)
  appendTitleSet(sets, changes)
  if ('etag' in changes) sets.push(sql`etag = ${changes.etag}`)
  if (changes.enabled !== undefined) {
    stateChanges.push({ kind: 'enablement', enabled: changes.enabled })
  }
  if (changes.discoverable !== undefined) {
    stateChanges.push({ kind: 'discoverability', enabled: changes.discoverable })
  }
  appendTimestampSets(sets, changes)
  if (changes.feed_type !== undefined) sets.push(sql`feed_type = ${changes.feed_type}`)
  if (changes.declared_language !== undefined) {
    sets.push(sql`declared_language = ${changes.declared_language ?? null}`)
  }
  if (changes.ignore_robots_txt !== undefined) {
    sets.push(sql`ignore_robots_txt = ${changes.ignore_robots_txt}`)
  }
  if (changes.unreliable_status_codes !== undefined) {
    sets.push(sql`unreliable_status_codes = ${changes.unreliable_status_codes}`)
  }

  return { sets, stateChanges }
}

async function appendUrlSet(
  sets: ReturnType<typeof sql>[],
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<void> {
  if (changes.rss_feed_url === undefined) return
  assert(
    isPublicRssFeedUrl(changes.rss_feed_url),
    400,
    'rss_feed_url must be a public http(s) URL without a fragment',
  )
  const rssFeedUrlId = await createRssFeedUrlId(changes.rss_feed_url, options)
  sets.push(sql`rss_feed_url_id = ${rssFeedUrlId}`)
}

async function appendTopicSet(
  sets: ReturnType<typeof sql>[],
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions,
): Promise<void> {
  if (changes.topic_id === undefined) return
  assert(isUUID(changes.topic_id), 400, 'topic_id must be a valid UUID')
  await assertTopicHasHostname(changes.topic_id, options)
  sets.push(sql`topic_id = ${changes.topic_id}`)
}

function appendTitleSet(sets: ReturnType<typeof sql>[], changes: UpdateRssFeedChanges): void {
  if (!('title' in changes)) return
  assert(
    changes.title === null || typeof changes.title === 'string',
    400,
    'title must be a string or null',
  )
  const normalizedTitle = typeof changes.title === 'string' ? changes.title.trim() : null
  assert(normalizedTitle !== '', 400, 'title must not be empty; set to null to clear')
  sets.push(sql`title = ${normalizedTitle}`)
}

function appendTimestampSets(sets: ReturnType<typeof sql>[], changes: UpdateRssFeedChanges): void {
  if ('last_modified_at' in changes) {
    sets.push(normalizeLastModifiedAt(changes.last_modified_at))
  }
  if (changes.last_fetched_at !== undefined) {
    sets.push(normalizeLastFetchedAt(changes.last_fetched_at))
  }
}

function normalizeLastModifiedAt(value: UpdateRssFeedChanges['last_modified_at']) {
  if (value === true) return sql`last_modified_at = CURRENT_TIMESTAMP`
  if (value instanceof Date) return sql`last_modified_at = ${value}`
  if (value === null) return sql`last_modified_at = NULL`
  throw new TypeError('last_modified_at must be a date, true, or null')
}

function normalizeLastFetchedAt(value: UpdateRssFeedChanges['last_fetched_at']) {
  if (value === true) return sql`last_fetched_at = CURRENT_TIMESTAMP`
  if (value instanceof Date) return sql`last_fetched_at = ${value}`
  throw new TypeError('last_fetched_at must be a date or true')
}
