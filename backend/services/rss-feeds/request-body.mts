import assert from 'http-assert'
import type { UpdateRssFeedChanges } from './update.mts'

const CREATE_SOURCE_KEYS = ['rss_feed_url', 'follow'] as const
const UPDATE_KEYS = [
  'enabled',
  'discoverable',
  'reason',
  'rss_feed_url',
  'title',
  'topic_id',
  // ignore_robots_txt is allowlisted here so assertNoUnknownKeys passes,
  // but it is NOT parsed by parseUpdateRssFeedBody — the route handler reads
  // it directly from rawBody behind an admin-only gate (admin-only field pattern).
  'ignore_robots_txt',
  'unreliable_status_codes',
] as const

export type UpdateRssFeedApiInput = Pick<
  UpdateRssFeedChanges,
  'rss_feed_url' | 'topic_id' | 'title'
> & {
  enabled?: boolean
  discoverable?: boolean
  reason?: string
}

export function parseCreateSourceBody(body: unknown): { rss_feed_url: string; follow?: boolean } {
  const record = assertPlainObject(body, 'Source create body must be an object')
  assertNoUnknownKeys(record, CREATE_SOURCE_KEYS)
  const parsed: { rss_feed_url: string; follow?: boolean } = {
    rss_feed_url: readRequiredString(record, 'rss_feed_url').trim(),
  }
  if ('follow' in record) parsed.follow = readOptionalBoolean(record, 'follow')
  return parsed
}

export function parseUpdateRssFeedBody(body: unknown): UpdateRssFeedApiInput {
  const record = assertPlainObject(body, 'RSS feed update body must be an object')
  assertNoUnknownKeys(record, UPDATE_KEYS)

  const changes: UpdateRssFeedApiInput = {}
  if ('rss_feed_url' in record) changes.rss_feed_url = readOptionalString(record, 'rss_feed_url')
  if ('topic_id' in record) changes.topic_id = readOptionalString(record, 'topic_id')
  if ('title' in record) changes.title = readOptionalNullableString(record, 'title')
  if ('enabled' in record) changes.enabled = readOptionalBoolean(record, 'enabled')
  if ('discoverable' in record) changes.discoverable = readOptionalBoolean(record, 'discoverable')
  if ('reason' in record) {
    assert(
      'enabled' in record || 'discoverable' in record,
      400,
      'reason requires enabled or discoverable',
    )
    changes.reason = readOptionalString(record, 'reason')
    assert(!changes.reason || changes.reason.length <= 1000, 400, 'reason too long')
  }
  return changes
}

function assertPlainObject(body: unknown, message: string): Record<string, unknown> {
  assert(body && typeof body === 'object' && !Array.isArray(body), 400, message)
  return body as Record<string, unknown>
}

function assertNoUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unknownKeys = Object.keys(record).filter(key => !allowedKeys.includes(key))
  assert(unknownKeys.length === 0, 400, `Unknown fields: ${unknownKeys.join(', ')}`)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  assert(typeof record[key] === 'string', 400, `${key} must be a string`)
  return record[key] as string
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  assert(value === undefined || typeof value === 'string', 400, `${key} must be a string`)
  return value as string | undefined
}

function readOptionalNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = record[key]
  assert(
    value === undefined || value === null || typeof value === 'string',
    400,
    `${key} must be a string or null`,
  )
  return value as string | null | undefined
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  assert(value === undefined || typeof value === 'boolean', 400, `${key} must be a boolean`)
  return value as boolean | undefined
}
