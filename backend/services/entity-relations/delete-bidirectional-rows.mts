import type { QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { EntityRelationMetadata } from './metadata.mts'
import { runRelationTransaction } from './run-relation-transaction.mts'
import { conflictOnRelationDeadlock } from './relation-deadlock.mts'

export async function softDeleteBidirectionalRelationRows(
  deleterId: string | null,
  relation: EntityRelationMetadata,
  anchorId: string,
  relatedIds: readonly string[],
  options?: QueryOptions,
): Promise<void> {
  const anchor = anchorId.toLowerCase()
  const distinctIds = [...new Set(relatedIds.map(id => id.toLowerCase()))]

  await conflictOnRelationDeadlock(() =>
    runRelationTransaction(options, async query => {
      if (distinctIds.length === 1) {
        const relatedId = distinctIds[0]!
        const [first, second]: [string, string] =
          anchor <= relatedId ? [anchor, relatedId] : [relatedId, anchor]
        const update = (subjectId: string, objectId: string) =>
          sql`/* softDeleteBidirectionalRelationRows */ UPDATE `.append(relation.table_name)
            .append(sql` SET deleted_at = NOW(), deleted_by_id = ${deleterId}
              WHERE subject_id = ${subjectId} AND object_id = ${objectId} AND deleted_at IS NULL`)
        const { rowCount } = await query(update(first, second))
        if (rowCount) {
          if (first !== second) await query(update(second, first))
          return
        }
        if (first === second) return
        // Without the first row's write, use one snapshot for the pair. An upsert could
        // otherwise insert or reactivate both directions before the second keyed update.
      }

      await query(
        sql`/* softDeleteBidirectionalRelationRows */ UPDATE `.append(relation.table_name)
          .append(sql` SET deleted_at = NOW(), deleted_by_id = ${deleterId}
            WHERE deleted_at IS NULL
              AND ((subject_id = ${anchor} AND object_id = ANY(${distinctIds}::uuid[]))
                OR (object_id = ${anchor} AND subject_id = ANY(${distinctIds}::uuid[])))`),
      )
    }),
  )
}
