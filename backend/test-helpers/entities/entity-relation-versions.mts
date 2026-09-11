import { read } from '@data-stores/psql'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'

const ALLOWED_RELATION_TABLES = new Set(
  entityRelationMetadatum.map(relation => relation.table_name),
)

export async function getEntityRelationVersion(
  tableName: string,
  subjectId: string,
  objectId: string,
): Promise<string | null> {
  if (!ALLOWED_RELATION_TABLES.has(tableName)) {
    throw new Error(`Invalid relation table name: ${tableName}`)
  }
  const { rows } = await read(
    sql`SELECT xmin::text AS row_version FROM `
      .append(tableName)
      .append(sql` WHERE subject_id = ${subjectId} AND object_id = ${objectId}`),
  )
  return (rows[0]?.row_version as string | undefined) ?? null
}
