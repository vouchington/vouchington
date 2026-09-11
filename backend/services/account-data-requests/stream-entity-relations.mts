import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

type EntityRelationStream = {
  tableName: string
  predicate: string
  objectType: string
  rows: AsyncGenerator<Record<string, unknown>>
}

/** Streams non-bookmark entity relations whose subject is the exporting user. */
export function streamEntityRelations(userId: string): EntityRelationStream[] {
  const nonBookmarkRelations = entityRelationMetadatum.filter(
    m => m.subject_type === 'user' && !m.is_bookmark,
  )

  return nonBookmarkRelations.map(relation => {
    const isUserTagRelation =
      relation.subject_type === 'user' &&
      relation.predicate === 'category' &&
      relation.object_type === 'topic'
    const query = sql`/* streamEntityRelations */ SELECT relation.object_id, `
    query.append(isUserTagRelation ? sql`topic.name` : sql`NULL::text`)
    query.append(
      sql` AS object_label, ${relation.predicate} AS predicate, relation.created_at FROM `,
    )
    query.append(relation.table_name)
    query.append(sql` AS relation`)
    if (isUserTagRelation) {
      query.append(sql` JOIN topics AS topic ON topic.id = relation.object_id`)
    }
    query.append(
      sql` WHERE relation.subject_id = ${userId} AND relation.deleted_at IS NULL ORDER BY relation.created_at ASC`,
    )

    return {
      tableName: relation.table_name,
      predicate: relation.predicate,
      objectType: relation.object_type,
      rows: createAsyncGeneratorFromCursor<Record<string, unknown>>(query),
    }
  })
}
