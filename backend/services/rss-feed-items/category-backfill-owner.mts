import type { TransactionQuery } from '@data-stores/psql/types'

export type CategoryBackfillMatch =
  | { kind: 'alias_id' | 'alias_text'; aliasId: string; alias: string }
  | { kind: 'topic_name'; sourceText: string; sourcePhase: 0 | 1 }

/** Fresh owner read after category locks prevents a stale page from remapping a new owner's rows. */
export async function stillOwnsCategoryBackfill(
  query: TransactionQuery,
  topicId: string,
  match: CategoryBackfillMatch,
): Promise<boolean> {
  if (match.kind !== 'topic_name') {
    const { rows } = await query<{ id: string }>(
      `/* backfillCategoriesForTopicAliases currentOwner */
       SELECT id FROM topic_aliases
       WHERE id = $1::uuid AND alias = LOWER($2::text) AND topic_id = $3::uuid
         AND unlink_requested_at IS NULL`,
      [match.aliasId, match.alias, topicId],
    )
    return rows.length > 0
  }
  const { rows } = await query<{ name: string; slug: string }>(
    `/* backfillCategoriesForTopicAliases currentTopicText */
     SELECT LOWER(name) AS name, slug FROM topics
     WHERE id = $1::uuid AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
    [topicId],
  )
  const currentText = match.sourcePhase === 0 ? rows[0]?.name : rows[0]?.slug
  return currentText === match.sourceText
}
