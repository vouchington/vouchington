import { bloomValkeyClient } from '@data-stores/valkey'
import { Batch, TimeUnit } from '@valkey/valkey-glide'
import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import type { EntityRelationEntityType } from '@services/entity-relations/config'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'
import { isUserActive } from '@services/users'
import {
  getUserBookmarkRelationCount,
  bookmarkBloomBatchesFromDb,
} from './bloom-filter-backfill.mts'
import {
  BOOKMARK_BLOOM_BATCH_SIZE,
  BOOKMARK_BLOOM_DEFAULT_CAPACITY,
  BOOKMARK_BLOOM_FILTER_TTL_SECONDS,
  BOOKMARK_BLOOM_READY_TTL_SECONDS,
  getBookmarkBloomFilter,
  getBookmarkBloomReadyKey,
  getUserBookmarkRelationByTableNameOrThrow,
} from './bloom-filter-utils.mts'
export {
  checkBookmarkBloomCandidates,
  checkBookmarkBloomCandidatesByRelations,
} from './bloom-filter-candidates.mts'

export function isBookmarkBloomFilterEnabled(): boolean {
  return bloomFilterConfig.fields.get('bookmarkBloomFilterEnabled') !== false
}

export function getUserBookmarkRelationsForEntityType(
  entityTypeName: EntityRelationEntityType,
): EntityRelationMetadata[] {
  return entityRelationMetadatum.filter(
    relation =>
      relation.subject_type === 'user' &&
      relation.object_type === entityTypeName &&
      relation.is_bookmark,
  )
}

export async function addBookmarkBloomEntries(
  userId: string,
  relationTableName: string,
  objectIds: string[],
): Promise<void> {
  if (objectIds.length === 0) return

  const relation = getUserBookmarkRelationByTableNameOrThrow(relationTableName)
  // Namespace entries by predicate: "{predicate}:{normalizedObjectId}"
  const items = objectIds.flatMap(id => {
    const key = normalizeKey(id)
    return key ? [`${relation.predicate}:${key}`] : []
  })
  if (items.length === 0) return

  // filter.add() absorbs all errors internally via .catch(onError); it never throws.
  // If the filter key doesn't exist, add() is a no-op (bloom-filter-add.lua guards both
  // live and building keys with EXISTS checks). The ready-marker check in
  // checkBookmarkBloomCandidates gates read-side usage until backfill completes and sets
  // the marker; any items missed during the cold window are recovered by the next rebuild.
  const filter = getBookmarkBloomFilter(userId)
  await filter.add(items)
}

// Idempotent: rebuildFromStream deletes any pre-existing `:building` key before streaming a fresh
// one, then atomically RENAMEs it over the live key -- concurrent or retried backfills for the
// same user converge on one consistent result rather than corrupting a partial filter.
export async function backfillUserBookmarkBloomFilter(userId: string): Promise<void> {
  // A backfill enqueued after deleteUser's post-commit enqueue outranks the delete job under the
  // shared `bookmark:{userId}` ordering key (glide-mq ordering sequences jobs, it does not cancel
  // ones already queued) and would otherwise rebuild the filter for a deleted user. Clean up any
  // residue left by a lost/failed delete job rather than bare-returning.
  if (!(await isUserActive(userId))) {
    await deleteUserBookmarkBloomFilter(userId)
    return
  }

  const allRelations = entityRelationMetadatum.filter(
    r => r.subject_type === 'user' && r.is_bookmark,
  )

  // Count all relations in parallel for capacity planning
  const counts = await Promise.all(
    allRelations.map(relation => getUserBookmarkRelationCount(userId, relation)),
  )
  const totalCount = counts.reduce((sum, c) => sum + c, 0)
  // 2× total count to reduce rebuild frequency as new bookmarks are added; +1 to avoid capacity=0
  // BOOKMARK_BLOOM_DEFAULT_CAPACITY provides a floor so new users don't get under-provisioned filters
  const capacity = Math.max(BOOKMARK_BLOOM_DEFAULT_CAPACITY, 2 * totalCount + 1)

  async function* allRelationsStream() {
    for (const relation of allRelations) {
      yield* bookmarkBloomBatchesFromDb(userId, relation, BOOKMARK_BLOOM_BATCH_SIZE)
    }
  }

  const filter = getBookmarkBloomFilter(userId)
  await filter.rebuildFromStream(allRelationsStream(), capacity)

  // After a successful rebuild, mark each relation ready via deterministic separate keys.
  // Using separate Valkey keys avoids the bloom filter false-positive risk for the ready signal.
  // Batch pipeline: 1 roundtrip instead of N independent SET + EXPIRE calls.
  const readyKeys = allRelations.map(relation =>
    getBookmarkBloomReadyKey(userId, relation.table_name),
  )
  const batch = new Batch(false)
  for (const readyKey of readyKeys) {
    batch.set(readyKey, '1', {
      expiry: { type: TimeUnit.Seconds, count: BOOKMARK_BLOOM_READY_TTL_SECONDS },
    })
  }
  // Refresh the live filter key's TTL on every successful backfill so an actively-maintained
  // filter never expires; a filter that stops being backfilled (e.g. its user was deleted)
  // self-expires within BOOKMARK_BLOOM_FILTER_TTL_SECONDS instead of leaking Valkey memory
  // forever. See the constant's comment in bloom-filter-utils.mts for the safety rationale.
  batch.expire(filter.getKey(), BOOKMARK_BLOOM_FILTER_TTL_SECONDS)
  try {
    await bloomValkeyClient.exec(batch, true)
  } catch (error) {
    // rebuildFromStream already atomically RENAMEd the live filter key into place; if this
    // Batch fails, that key is left with no ready markers and no TTL -- reverting to the
    // pre-PR unbounded-memory state until the next backfill. Delete it so reads degrade to the
    // normal "filter absent" fallback (PostgreSQL + re-enqueued backfill) instead.
    /* v8 ignore start -- Valkey remains real in tests; forced client failures would destabilize shared test state. */
    await filter.deleteWithAdditionalKeys(readyKeys).catch(onError)
    throw error
    /* v8 ignore stop */
  }
}

// Idempotent: UNLINK on an already-absent key is a no-op, so calling this multiple times
// (retries, or a delayed manual replay after the user is already fully deleted) is safe.
export async function deleteUserBookmarkBloomFilter(userId: string): Promise<void> {
  const allRelations = entityRelationMetadatum.filter(
    r => r.subject_type === 'user' && r.is_bookmark,
  )
  const readyKeys = allRelations.map(r => getBookmarkBloomReadyKey(userId, r.table_name))
  const filter = getBookmarkBloomFilter(userId)
  // Delete filter + ready keys in a single UNLINK call (1 roundtrip).
  await filter.deleteWithAdditionalKeys(readyKeys)
}
