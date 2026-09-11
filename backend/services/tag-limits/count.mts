import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { EntityRelationMetadata } from '@voucha/types/entities/entity-relations-metadata'

// `relation` is a full EntityRelationMetadata object (not a raw table-name string) so that
// `relation.table_name` can only ever be a value drawn from the closed, code-defined
// entityRelationMetadatum registry -- never an arbitrary/user-controlled string -- before it is
// interpolated into the query below.
export async function countUserOriginatedTagRelations(
  relation: EntityRelationMetadata,
  subjectId: string,
  userId: string,
): Promise<number> {
  const query = sql`/* countUserOriginatedTagRelations */
    SELECT COUNT(*)::text AS count
    FROM `
  query.append(relation.table_name)
  query.append(sql`
    WHERE subject_id = ${subjectId}::uuid
      AND created_by_id = ${userId}::uuid
      AND deleted_at IS NULL
  `)
  const { rows } = await read<{ count: string }>(query)
  return parseInt(rows[0].count, 10)
}
