import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { GooglePlayLineageConflictError } from './token-alias.mts'

export type GooglePlayTokenFetch = { aliasId: string; predecessorId: string | null }

/**
 * Marks every fetched alias of a resolved lineage in one statement. A reported-only alias becomes
 * fetched on the same row; its predecessor link is set once and a different one is a conflict. The
 * caller holds the canonical lineage lock and passes at most one alias per resolved lineage token.
 */
export async function markGooglePlayTokensFetched(
  fetches: readonly GooglePlayTokenFetch[],
  query: QueryExecutor,
): Promise<void> {
  const predecessors = new Map<string, string | null>()
  for (const { aliasId, predecessorId } of fetches) {
    const known = predecessors.get(aliasId)
    if (known && predecessorId && known !== predecessorId)
      throw new GooglePlayLineageConflictError()
    predecessors.set(aliasId, known ?? predecessorId)
  }
  if (predecessors.size === 0) return
  const { rows } = await query<{ id: string }>(sql`/* markGooglePlayTokensFetched */
    UPDATE membership_google_play_purchase_tokens AS token
    SET fetched_at = COALESCE(token.fetched_at, CURRENT_TIMESTAMP),
      linked_purchase_token_id = COALESCE(token.linked_purchase_token_id, input.predecessor_id)
    FROM unnest(${[...predecessors.keys()]}::uuid[], ${[...predecessors.values()]}::uuid[])
      AS input(id, predecessor_id)
    WHERE token.id = input.id
      AND (
        input.predecessor_id IS NULL
        OR token.linked_purchase_token_id IS NULL
        OR token.linked_purchase_token_id = input.predecessor_id
      )
    RETURNING token.id`)
  if (rows.length !== predecessors.size) throw new GooglePlayLineageConflictError()
}
