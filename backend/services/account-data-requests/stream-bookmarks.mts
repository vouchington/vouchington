import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

type BookmarkStream = {
  tableName: string
  predicate: string
  objectType: string
  rows: AsyncGenerator<Record<string, unknown>>
}

/** Streams bookmarks (entity relations where user is subject and is_bookmark=true). */
export function streamBookmarks(userId: string): BookmarkStream[] {
  const bookmarkRelations = entityRelationMetadatum.filter(
    m => m.subject_type === 'user' && m.is_bookmark,
  )

  return bookmarkRelations.map(relation => {
    const query = sql`/* streamBookmarks */ SELECT object_id`
    query.append(sql`, ${relation.predicate} AS predicate, created_at FROM `)
    query.append(relation.table_name)
    query.append(sql` WHERE subject_id = ${userId} AND deleted_at IS NULL ORDER BY created_at ASC`)

    return {
      tableName: relation.table_name,
      predicate: relation.predicate,
      objectType: relation.object_type,
      rows: createAsyncGeneratorFromCursor<Record<string, unknown>>(query),
    }
  })
}
