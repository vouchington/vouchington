import type { TransactionQuery } from '@data-stores/psql'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { invalidateResolvedTopicKeysStrict } from '@services/entity-cache/invalidate-strict'
import { normalizeKey } from '@ts-shared/utils/strings'

/** Effects run after the redirect commits; cursor commit follows successful strict cache work. */
export async function processTopicMergeAliasEffectsPage(
  query: TransactionQuery,
  operationId: string,
  afterAliasId: string | null,
  limit: number,
): Promise<{ cursorId: string | null; hasMore: boolean }> {
  const { rows } = await query<{ alias_id: string; alias: string }>(
    `/* processTopicMergeAliasEffectsPage */ WITH page AS MATERIALIZED (
      SELECT alias_id FROM topic_merge_operation_aliases
      WHERE operation_id = $1::uuid
        AND alias_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY alias_id LIMIT $3::integer
    ) SELECT page.alias_id, alias.alias FROM page JOIN topic_aliases alias ON alias.id = page.alias_id
      ORDER BY page.alias_id`,
    [operationId, afterAliasId, limit],
  )
  if (rows.length) {
    const keys = rows.map(row => normalizeKey(row.alias))
    await addEntityBloomKeys('topics', keys)
    await invalidateResolvedTopicKeysStrict(keys)
  }
  return { cursorId: rows.at(-1)?.alias_id ?? afterAliasId, hasMore: rows.length === limit }
}

/** Destination aliases were handled separately, so retained redirect identities cannot fan out. */
export async function processTopicMergeRedirectEffectsPage(
  query: TransactionQuery,
  destinationId: string,
  afterTopicId: string | null,
  limit: number,
): Promise<{ cursorId: string | null; hasMore: boolean }> {
  const { rows } = await query<{ id: string; slug: string }>(
    // no-mistakes-disable-next-line postgres-required-predicates: invalidate retained source identity keys without authorizing inactive topics.
    `/* processTopicMergeRedirectEffectsPage */ SELECT id, slug FROM topics
      WHERE merged_into_topic_id = $1::uuid
        AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT $3::integer`,
    [destinationId, afterTopicId, limit],
  )
  if (rows.length)
    await invalidateResolvedTopicKeysStrict(rows.flatMap(row => [row.id, normalizeKey(row.slug)]))
  return { cursorId: rows.at(-1)?.id ?? afterTopicId, hasMore: rows.length === limit }
}
