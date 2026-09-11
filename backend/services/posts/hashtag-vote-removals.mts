import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'

export async function getRemovedPositivePostHashtagRelations(
  contributorId: string,
  relation: EntityRelationMetadata,
  postId: string,
): Promise<Array<{ id: string }>> {
  const query = sql`/* getRemovedPositivePostHashtagRelations */ SELECT relation.id FROM `
  query.append(relation.table_name)
  query.append(sql` relation JOIN LATERAL (SELECT score FROM `)
  query.append(getEntityRelationVoteTableName(relation))
  query.append(sql` vote WHERE vote.entity_relation_id = relation.id AND vote.user_id = ${contributorId}
    ORDER BY vote.id DESC LIMIT 1) current_vote ON current_vote.score > 0
    WHERE relation.subject_id = ${postId} AND relation.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM post_topic_alias_sources source
        WHERE source.post_id = relation.subject_id AND source.topic_alias_id = relation.object_id
          AND source.contributor_id = ${contributorId})`)
  const { rows } = await write<{ id: string }>(query)
  return rows
}
