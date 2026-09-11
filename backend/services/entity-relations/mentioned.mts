import { read } from '@data-stores/psql'
import { entityRelationEntityTables, entityRelationMetadatum } from './metadata.mts'
import type { EntityRelationEntityType } from './config.mts'

const VALID_ENTITY_TYPES = new Set<EntityRelationEntityType>(
  Object.keys(entityRelationEntityTables) as EntityRelationEntityType[],
)

/**
 * Get all existing mentioned relations for a post
 */
export async function getExistingMentionedRelations(postId: string) {
  const relations = entityRelationMetadatum.filter(
    r => r.object_type === 'post' && r.predicate === 'mentioned',
  )

  if (relations.length === 0) {
    return { users: [], topics: [], posts: [] }
  }

  const { query, values } = buildMentionedRelationsQuery(relations, postId)
  const { rows } = await read(query, values)

  const users = rows.flatMap((r: { subject_type: string; subject_id: string }) =>
    r.subject_type === 'user' ? [r.subject_id] : [],
  )
  const topics = rows.flatMap((r: { subject_type: string; subject_id: string }) =>
    r.subject_type === 'topic' ? [r.subject_id] : [],
  )
  const posts = rows.flatMap((r: { subject_type: string; subject_id: string }) =>
    r.subject_type === 'post' ? [r.subject_id] : [],
  )

  return { users, topics, posts }
}

function buildMentionedRelationsQuery(
  relations: Array<{ subject_type: string; table_name: string }>,
  postId: string,
) {
  const subqueries: string[] = []
  const params: unknown[] = [postId]

  for (const relation of relations) {
    // Validate subject_type to prevent SQL injection
    if (!VALID_ENTITY_TYPES.has(relation.subject_type as EntityRelationEntityType)) {
      throw new Error(`Invalid entity type: ${relation.subject_type}`)
    }

    // Validate table_name format (must match pattern: relation__<type>__<predicate>__<type>)
    if (!/^relation__[a-z_]+__[a-z_]+__[a-z_]+$/.test(relation.table_name)) {
      throw new Error(`Invalid table name: ${relation.table_name}`)
    }

    const paramIndex = params.length + 1
    params.push(relation.subject_type)

    subqueries.push(`/* getExistingMentionedRelations */
      SELECT
        subject_id,
        $${paramIndex} AS subject_type
      FROM ${relation.table_name}
      WHERE object_id = $1
        AND deleted_at IS NULL
    `)
  }

  return {
    query: subqueries.join(' UNION ALL '),
    values: params,
  }
}
