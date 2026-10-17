import { beginTransaction } from '@data-stores/psql'
import {
  entityRelationEntityTables,
  entityRelationMetadatum,
} from '@voucha/types/entities/entity-relations-metadata'
import { seedUuid } from './common.mts'

/** Populate every elected family so per-user EXPLAIN captures include real rows and excluded voters. */
export async function seedRelationVoteReads() {
  await using transaction = await beginTransaction()
  for (const metadata of entityRelationMetadatum.filter(row => row.election)) {
    const subjectTable = entityRelationEntityTables[metadata.subject_type].foreign_key_table
    const objectTable = entityRelationEntityTables[metadata.object_type].foreign_key_table
    // no-mistakes-disable-next-line query-reached-per-item: fixed elected-family seed loop creates distinct FK-valid parent and vote fixtures with bounded noise rows
    const { rows: subjects } = await transaction<{ id: string }>(
      `/* seedRelationVoteReads */ SELECT id FROM ${subjectTable} ORDER BY id OFFSET 2 LIMIT 1`,
    )
    const subjectId = subjects[0]?.id
    if (!subjectId) throw new Error(`Missing ${subjectTable} relation-vote seed subject`)
    // no-mistakes-disable-next-line query-reached-per-item: fixed elected-family seed loop creates distinct FK-valid parent and vote fixtures with bounded noise rows
    const { rows: objects } = await transaction<{ id: string }>(
      `/* seedRelationVoteReads */ SELECT id FROM ${objectTable} WHERE id <> $1 ORDER BY id OFFSET 3 LIMIT 1`,
      [subjectId],
    )
    const objectId = objects[0]?.id
    if (!objectId) throw new Error(`Missing ${objectTable} relation-vote seed object`)
    // no-mistakes-disable-next-line query-reached-per-item: fixed elected-family seed loop creates distinct FK-valid parent and vote fixtures with bounded noise rows
    const { rows: relations } = await transaction<{ id: string }>(
      `/* seedRelationVoteReads */ WITH inserted AS (
        INSERT INTO ${metadata.table_name} (subject_id, object_id, created_by_id)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id
      ) SELECT id FROM inserted UNION ALL
      SELECT id FROM ${metadata.table_name} WHERE subject_id = $1 AND object_id = $2 LIMIT 1`,
      [subjectId, objectId, seedUuid(3, '01')],
    )
    const relationId = relations[0]?.id
    if (!relationId) throw new Error(`Missing ${metadata.table_name} relation-vote seed target`)
    const userIds = [
      seedUuid(3, '01'),
      ...Array.from({ length: 1000 }, (_, index) => seedUuid(index + 1000, '01')),
    ]
    // no-mistakes-disable-next-line query-reached-per-item: fixed elected-family seed loop creates distinct FK-valid parent and vote fixtures with bounded noise rows
    await transaction(
      `/* seedRelationVoteReads */ INSERT INTO ${metadata.table_name}__votes
        (subject_id, entity_relation_id, user_id, score)
        SELECT $1, $2, user_id, 1 FROM unnest($3::uuid[]) AS voters(user_id)
        WHERE NOT EXISTS (SELECT 1 FROM ${metadata.table_name}__votes existing
          WHERE existing.entity_relation_id = $2 AND existing.user_id = voters.user_id)`,
      [subjectId, relationId, userIds],
    )
  }
  await transaction.commit()
}
