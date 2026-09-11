import { bloomValkeyClient, normalizeBloomCheckResult } from '@data-stores/valkey'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import {
  getBookmarkBloomFilter,
  getBookmarkBloomReadyKey,
  getUserBookmarkRelationByTableNameOrThrow,
  normalizeBookmarkObjectIds,
} from './bloom-filter-utils.mts'
import onError from '@modules/on-error'

// Bounds the number of lookup items packed into a single check-bloom-candidates.lua invocation
// (Redis EVALSHA arg-count safety), independent of BOOKMARK_BLOOM_BATCH_SIZE in bloom-filter-utils.mts,
// which bounds BF.MADD write payloads and DB backfill cursor size. The two happen to share a value
// today; do not import one to satisfy the other; tune each for its own operation.
const BOOKMARK_BLOOM_LUA_LOOKUP_BATCH_SIZE = 5_000
const checkBloomCandidatesScript = registerScript(
  loadScript('check-bloom-candidates.lua', import.meta.url),
)

export type BookmarkBloomCandidates = {
  ready: boolean
  results: (boolean | null)[]
}

export type BookmarkBloomCandidateChunk = {
  itemCount: number
  lookupItems: string[]
}

export async function invokeBookmarkBloomCandidateChunks(
  chunks: readonly BookmarkBloomCandidateChunk[],
  invokeChunk: (chunk: BookmarkBloomCandidateChunk) => Promise<unknown>,
): Promise<unknown[]> {
  const results: unknown[] = []
  for (const chunk of chunks) {
    // oxlint-disable-next-line no-await-in-loop -- bookmark bloom Lua chunks must stay sequential to bound Valkey request pressure.
    results.push(await invokeChunk(chunk))
  }
  return results
}

function createUnreadyBookmarkBloomCandidates(
  relations: EntityRelationMetadata[],
  itemCount: number,
): Record<string, BookmarkBloomCandidates> {
  const output: Record<string, BookmarkBloomCandidates> = {}
  for (const relation of relations) {
    output[relation.table_name] = {
      ready: false,
      results: Array.from({ length: itemCount }, (): null => null),
    }
  }
  return output
}

export async function checkBookmarkBloomCandidates(
  userId: string,
  relationTableName: string,
  objectIds: string[],
): Promise<BookmarkBloomCandidates> {
  const resultsByRelation = await checkBookmarkBloomCandidatesByRelations(
    userId,
    [relationTableName],
    objectIds,
  )
  return (
    resultsByRelation[relationTableName] || { ready: false, results: objectIds.map(() => null) }
  )
}

export async function checkBookmarkBloomCandidatesByRelations(
  userId: string,
  relationTableNames: string[],
  objectIds: string[],
): Promise<Record<string, BookmarkBloomCandidates>> {
  if (relationTableNames.length === 0) return {}
  if (objectIds.length === 0) {
    const emptyResults: Record<string, BookmarkBloomCandidates> = {}
    for (const relationTableName of relationTableNames) {
      emptyResults[relationTableName] = { ready: true, results: [] }
    }
    return emptyResults
  }

  const relations = relationTableNames.map(name => getUserBookmarkRelationByTableNameOrThrow(name))
  const normalizedIds = normalizeBookmarkObjectIds(objectIds)
  const filter = getBookmarkBloomFilter(userId)
  const readyKeys = relations.map(r => getBookmarkBloomReadyKey(userId, r.table_name))
  const output: Record<string, BookmarkBloomCandidates> = {}
  for (const relation of relations) {
    output[relation.table_name] = { ready: true, results: [] }
  }

  const chunks: BookmarkBloomCandidateChunk[] = []
  for (let start = 0; start < normalizedIds.length; start += BOOKMARK_BLOOM_LUA_LOOKUP_BATCH_SIZE) {
    const end = Math.min(start + BOOKMARK_BLOOM_LUA_LOOKUP_BATCH_SIZE, normalizedIds.length)
    const batchItemCount = end - start
    const batchLookupItems: string[] = []
    for (const relation of relations) {
      for (let i = start; i < end; i++) {
        batchLookupItems.push(`${relation.predicate}:${normalizedIds[i]}`)
      }
    }
    chunks.push({ itemCount: batchItemCount, lookupItems: batchLookupItems })
  }

  let scriptResults: unknown[]
  try {
    const scriptKeys = [filter.getKey(), ...readyKeys]
    scriptResults = await invokeBookmarkBloomCandidateChunks(chunks, chunk =>
      bloomValkeyClient.invokeScript(checkBloomCandidatesScript, {
        keys: scriptKeys,
        args: [String(relations.length), String(chunk.itemCount), ...chunk.lookupItems],
      }),
    )
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    return createUnreadyBookmarkBloomCandidates(relations, normalizedIds.length)
  }

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const batchItemCount = chunks[chunkIndex]!.itemCount
    const scriptResult = scriptResults[chunkIndex]
    const values = Array.isArray(scriptResult) ? scriptResult : []
    let offset = 0
    for (const relation of relations) {
      const candidates = output[relation.table_name]!
      const ready = values[offset] === 1 || values[offset] === 1n
      const rawResults = values.slice(offset + 1, offset + 1 + batchItemCount)
      if (!ready) {
        candidates.ready = false
      } else if (candidates.ready) {
        candidates.results.push(...rawResults.map(normalizeBloomCheckResult))
      }
      offset += 1 + batchItemCount
    }
  }

  for (const relation of relations) {
    const candidates = output[relation.table_name]!
    if (!candidates.ready) {
      candidates.results = normalizedIds.map(() => null)
    }
  }
  return output
}
