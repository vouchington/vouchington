import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type UserTagRelation = { id: string; subject_id: string; object_id: string }

export async function getUserTagRelationById(id: string): Promise<UserTagRelation | null> {
  const { rows } = await read<UserTagRelation>(sql`/* getUserTagRelationById */
    SELECT id, subject_id, object_id
    FROM relation__user__category__topic
    WHERE id = ${id}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0] ?? null
}
