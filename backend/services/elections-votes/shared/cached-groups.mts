import { read, assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { caches } from '@services/entity-cache/caches'
import { createElectionBatchGetter } from './entity-service.mts'
import type { ViewBaseElection } from './types.mts'
import { POST_ELECTION_CONFIG } from '../post/config.mts'
import { TOPIC_ELECTION_CONFIG } from '../topic/config.mts'
import { HOSTNAME_ELECTION_CONFIG } from '../hostname/config.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from '../rss-feed-item/config.mts'
import { AGENT_MODERATION_ELECTION_CONFIG } from '../agent-moderation/config.mts'
import type { ViewPostElection } from '../post/types.mts'
import type { ViewTopicElection } from '../topic/types.mts'
import type { ViewHostnameElection } from '../hostname/types.mts'
import type { ViewRssFeedItemElection } from '../rss-feed-item/types.mts'
import type { ViewAgentModerationElection } from '../agent-moderation/types.mts'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'

const families = {
  post: { cache: caches.post_elections, config: POST_ELECTION_CONFIG },
  topic: { cache: caches.topic_elections, config: TOPIC_ELECTION_CONFIG },
  hostname: { cache: caches.hostname_elections, config: HOSTNAME_ELECTION_CONFIG },
  rss_feed_item: { cache: caches.rss_feed_item_elections, config: RSS_FEED_ITEM_ELECTION_CONFIG },
  agent_moderation: {
    cache: caches.agent_moderation_elections,
    config: AGENT_MODERATION_ELECTION_CONFIG,
  },
}
type Family = keyof typeof families
type Elections = {
  post: ViewPostElection
  topic: ViewTopicElection
  hostname: ViewHostnameElection
  rss_feed_item: ViewRssFeedItemElection
  agent_moderation: ViewAgentModerationElection
}
type Groups<K extends Family> = { [F in K]: Array<Elections[F] | null> }
type Pending = {
  family: Family
  ids: string[]
  resolve: (rows: Array<ViewBaseElection | null>) => void
  reject: (error: unknown) => void
}
const tables = ['posts', 'topics', 'url_hostnames', 'rss_feed_items', 'agent_moderations']

/** Keeps each family's cache keys, negative hits, refreshes and invalidation fences intact. */
export async function getCachedElectionGroups<K extends Family>(
  groups: Record<K, string[]>,
): Promise<Groups<K>> {
  const entries = Object.entries(groups) as Array<[K, string[]]>
  const pending: Pending[] = []
  let collecting = true
  const ready: Promise<void>[] = []
  const results = entries.map(([family, ids]) => {
    const discovered = Promise.withResolvers<void>()
    ready.push(discovered.promise)
    const { cache, config } = families[family]
    const get = cache.cacheGetByAnyBatch<ViewBaseElection>(misses => {
      // Refresh-ahead is owned by the cache. A later independent refresh must never hang
      // waiting for an already completed foreground batch.
      if (!collecting) return createElectionBatchGetter<ViewBaseElection>(config)(misses)
      const result = Promise.withResolvers<Array<ViewBaseElection | null>>()
      pending.push({ family, ids: misses, resolve: result.resolve, reject: result.reject })
      discovered.resolve()
      return result.promise
    })
    const result = get(ids)
    // A full cache hit (including a cached null) also completes discovery without SQL.
    void result.then(
      () => discovered.resolve(),
      () => discovered.resolve(),
    )
    return result.then(rows => [family, rows] as const)
  })
  const completion = Promise.allSettled(results)
  await Promise.all(ready)
  collecting = false
  if (pending.length) void settleMissingElectionGroups(pending)
  const resolved: Array<readonly [K, Array<ViewBaseElection | null>]> = []
  for (const outcome of await completion) {
    if (outcome.status === 'rejected') throw outcome.reason
    resolved.push(outcome.value)
  }
  return Object.fromEntries(resolved) as Groups<K>
}

async function settleMissingElectionGroups(pending: Pending[]): Promise<void> {
  try {
    const rows = await readMissingElectionGroups(pending)
    for (const [index, request] of pending.entries()) request.resolve(rows[index]!)
  } catch (err) {
    // Each rejection is observed by its foreground cache read or owned refresh-ahead task.
    for (const request of pending) request.reject(err)
  }
}

async function readMissingElectionGroups(
  pending: Pending[],
): Promise<Array<Array<ViewBaseElection | null>>> {
  const query = sql`/* getCachedElectionGroups */ `
  pending.forEach((request, index) => {
    if (index) query.append(' UNION ALL ')
    for (const id of request.ids) {
      if (!isUUID(id)) throw createError(422, `Invalid ID: ${id}`)
    }
    const { config } = families[request.family]
    query.append(sql`SELECT ${index}::int AS request_index,
      input.position::int AS input_position, `)
    query.append(sql`${config.entityType}::text AS __entity_type,
      entity.id, entity.votes_score_net, entity.votes_count_up, entity.votes_count_down
      FROM `)
    query.append(assertWhitelistedSqlIdentifier(config.entityTable!, tables, 'electionEntityTable'))
    query.append(sql` entity
      JOIN UNNEST(${request.ids}::uuid[]) WITH ORDINALITY AS input(id, position)
        ON entity.id = input.id`)
    if (config.deletedAtFilter) query.append(' WHERE entity.deleted_at IS NULL')
  })
  const { rows } = await read(query)
  const results = pending.map(request =>
    new Array<ViewBaseElection | null>(request.ids.length).fill(null),
  )
  for (const row of rows) {
    const { request_index, input_position, ...election } = row
    results[request_index]![input_position - 1] = election as ViewBaseElection
  }
  return results
}
