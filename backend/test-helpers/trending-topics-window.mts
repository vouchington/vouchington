import { AsyncLocalStorage } from 'node:async_hooks'
import { advisoryLockPool, type PoolClient } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { getEntityRelationTableNameOrThrow } from '@voucha/types/entities/entity-relations-metadata'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@voucha/types/entities/entity-relation-tables'
import sql from 'sql-template-strings'

const DAY_MS = 24 * 60 * 60 * 1000
const NAMESPACE = 0x54545731
const CELL_COUNT = 128
const relationTables = [
  POST_TOPIC_CATEGORY_RELATION_TABLE,
  getEntityRelationTableNameOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  }),
]
type Window = { lower: string; upper: string; startsAt: number; topics: Map<string, string> }
const ownedWindow = new AsyncLocalStorage<Window>()

/** Run real global-query assertions in an empty, locked cell; remove only its owned relations. */
export async function withTestTrendingTopicsWindow<T>(
  handler: (referenceTime: Date) => Promise<T>,
): Promise<T> {
  const client = await advisoryLockPool.connect()
  let slot: number | undefined
  let window: Window | undefined
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  const cleanupErrors: unknown[] = []
  try {
    // Enumerate every cell once: occupied prefixes cannot hide a later free cell.
    for (let candidate = 0; candidate < CELL_COUNT; candidate++) {
      const { rows } = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1, $2) AS acquired',
        [NAMESPACE, candidate],
      )
      if (!rows[0]) throw new Error('Trending window try-lock returned no result')
      if (!rows[0].acquired) continue
      slot = candidate
      const startsAt = Date.UTC(1972, 0, 1) + candidate * 64 * DAY_MS
      window = {
        startsAt,
        topics: new Map(),
        lower: timestampToUuidv7LowerBound(startsAt),
        upper: timestampToUuidv7LowerBound(startsAt + 64 * DAY_MS),
      }
      if (!(await isOccupied(client, window))) break
      await unlock(client, slot)
      slot = undefined
      window = undefined
    }
    if (slot === undefined || window === undefined) {
      throw new Error('All 128 trending fixture cells are occupied or currently locked')
    }
    const selected = window
    const value = await ownedWindow.run(selected, () =>
      handler(new Date(selected.startsAt + 35 * DAY_MS)),
    )
    outcome = { ok: true, value }
  } catch (err) {
    outcome = { ok: false, error: err }
  } finally {
    if (window && window.topics.size > 0) {
      for (const table of relationTables) {
        try {
          await client.query(
            sql`/* clearOwnedTrendingTopicRelations */ DELETE FROM `.append(table).append(sql`
            WHERE (object_id, created_by_id) IN (
              SELECT * FROM UNNEST(${[...window.topics.keys()]}::uuid[], ${[...window.topics.values()]}::uuid[])
            )
              AND id >= ${window.lower} AND id < ${window.upper}`),
          )
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
    }
    if (slot !== undefined) {
      try {
        await unlock(client, slot)
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    try {
      client.release(
        cleanupErrors.length
          ? new Error('Trending window cleanup failed', { cause: cleanupErrors[0] })
          : undefined,
      )
    } catch (err) {
      cleanupErrors.push(err)
    }
  }
  const errors = outcome.ok ? [] : [outcome.error]
  for (const error of cleanupErrors) {
    if (!errors.some(existing => Object.is(existing, error))) errors.push(error)
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Trending fixture body and cleanup failed')
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

/** Called before relation inserts; inherited async context records partial fixture writes too. */
export function registerTestTrendingTopicWindowFixture(
  topicId: string,
  actorId: string,
  relationMs: number,
): void {
  const window = ownedWindow.getStore()
  if (!window) return
  if (relationMs < window.startsAt || relationMs >= window.startsAt + 64 * DAY_MS) {
    throw new Error('Trending fixture relation time escapes its owned window')
  }
  window.topics.set(topicId, actorId)
}

async function isOccupied(client: PoolClient, window: Window): Promise<boolean> {
  const { rows } = await client.query<{ occupied: boolean }>(
    sql`/* readTrendingWindowOccupancy */ SELECT EXISTS(SELECT 1 FROM `
      .append(relationTables[0])
      .append(sql`
        WHERE id >= ${window.lower} AND id < ${window.upper} LIMIT 1) OR
      EXISTS(SELECT 1 FROM `)
      .append(relationTables[1]).append(sql`
        WHERE id >= ${window.lower} AND id < ${window.upper} LIMIT 1) AS occupied`),
  )
  if (!rows[0]) throw new Error('Trending window occupancy returned no result')
  return rows[0].occupied
}

async function unlock(client: PoolClient, slot: number): Promise<void> {
  const { rows } = await client.query<{ unlocked: boolean }>(
    'SELECT pg_advisory_unlock($1, $2) AS unlocked',
    [NAMESPACE, slot],
  )
  if (!rows[0]?.unlocked) throw new Error('PostgreSQL did not release the trending fixture cell')
}
