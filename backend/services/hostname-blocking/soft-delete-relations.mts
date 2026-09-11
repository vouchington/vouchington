import type { TransactionQuery } from '@data-stores/psql/types'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import { lockPostPublicationPostScopes } from '@services/post-publication'

const POST_RELATED_URL_TABLE = 'relation__post__related__url'
const POST_RELATED_URL_DELETE_BATCH_SIZE = 500

export async function softDeleteBlockedHostnameRelations(
  adminUserId: string,
  hostnameIds: string[],
  query: TransactionQuery,
): Promise<{ creatorIds: string[]; totalDeleted: number }> {
  const urlRelationTables = getEntityRelationUrlTables()
  if (urlRelationTables.length === 0) return { creatorIds: [], totalDeleted: 0 }

  const creatorSql = `/* blockHostname_getCreators */
    SELECT DISTINCT created_by_id FROM (${urlRelationTables
      .map(
        table => `
          SELECT created_by_id
          FROM "${table}"
          WHERE object_id IN (SELECT id FROM urls WHERE hostname_id = ANY($1::uuid[]))
            AND deleted_at IS NULL
            AND created_by_id IS NOT NULL
        `,
      )
      .join(' UNION ALL ')}) sub
  `
  const { rows: creatorRows } = await query<{ created_by_id: string }>(creatorSql, [hostnameIds])

  const otherUrlRelationTables = urlRelationTables.filter(table => table !== POST_RELATED_URL_TABLE)
  const deleteCTEs = otherUrlRelationTables.map(
    (table, index) => `
      del_${index} AS (
        UPDATE "${table}"
        SET deleted_at = NOW(), deleted_by_id = $1
        WHERE object_id IN (SELECT id FROM urls WHERE hostname_id = ANY($2::uuid[]))
          AND deleted_at IS NULL
        RETURNING 1 AS deleted
      )
    `,
  )
  const countSelects = otherUrlRelationTables
    .map((_, index) => `(SELECT COUNT(*) FROM del_${index})`)
    .join(' + ')
  let totalDeleted = 0
  if (deleteCTEs.length > 0) {
    const deleteSql = `/* blockHostname_softDeleteRelations */
      WITH ${deleteCTEs.join(', ')}
      SELECT (${countSelects})::int AS total_deleted
    `
    const { rows } = await query<{ total_deleted: number }>(deleteSql, [adminUserId, hostnameIds])
    totalDeleted = rows[0]!.total_deleted
  }

  if (urlRelationTables.includes(POST_RELATED_URL_TABLE)) {
    totalDeleted += await deletePostRelatedUrls(adminUserId, hostnameIds, query)
  }

  return {
    creatorIds: creatorRows.map(row => row.created_by_id),
    totalDeleted,
  }
}

async function deletePostRelatedUrls(
  adminUserId: string,
  hostnameIds: string[],
  query: TransactionQuery,
): Promise<number> {
  let totalDeleted = 0
  while (true) {
    // This discovery query deliberately does not lock relation rows: publication locks must be
    // acquired first, in the same order as other post-publication writers.
    // oxlint-disable-next-line no-await-in-loop -- each discovery batch is bounded.
    const { rows: postRows } = await query<{ subject_id: string }>(
      `/* blockHostname_findPostRelatedUrlPosts */
      SELECT relation.subject_id
      FROM "${POST_RELATED_URL_TABLE}" relation
      JOIN urls url ON url.id = relation.object_id
      WHERE url.hostname_id = ANY($1::uuid[])
        AND relation.deleted_at IS NULL
      GROUP BY relation.subject_id
      ORDER BY relation.subject_id
      LIMIT $2`,
      [hostnameIds, POST_RELATED_URL_DELETE_BATCH_SIZE],
    )
    if (postRows.length === 0) return totalDeleted

    // oxlint-disable-next-line no-await-in-loop -- globally ordered, bounded publication locks precede relation-row locks.
    await lockPostPublicationPostScopes(
      query,
      postRows.map(row => row.subject_id),
    )

    // oxlint-disable-next-line no-await-in-loop -- each delete and publication capture is capped at the relation batch size.
    const { rows } = await query<{
      subject_id: string
      deleted_count: number
      publication_eligibility_changed: boolean
    }>(
      `/* blockHostname_softDeletePostRelatedUrls */
      WITH deleted AS (
        UPDATE "${POST_RELATED_URL_TABLE}" relation
        SET deleted_at = NOW(), deleted_by_id = $1
        WHERE relation.subject_id = ANY($2::uuid[])
          AND relation.object_id IN (SELECT id FROM urls WHERE hostname_id = ANY($3::uuid[]))
          AND relation.deleted_at IS NULL
        RETURNING relation.subject_id, relation.votes_score_net
      )
      SELECT subject_id, COUNT(*)::int AS deleted_count,
        BOOL_OR(votes_score_net > 0) AS publication_eligibility_changed
      FROM deleted
      GROUP BY subject_id
      ORDER BY subject_id`,
      [adminUserId, postRows.map(row => row.subject_id), hostnameIds],
    )
    if (rows.length === 0) return totalDeleted
    totalDeleted += rows.reduce((count, row) => count + row.deleted_count, 0)
    const postIds: string[] = []
    for (const row of rows) {
      if (row.publication_eligibility_changed) postIds.push(row.subject_id)
    }
    // oxlint-disable-next-line no-await-in-loop -- dirty work must be durable in the same transaction as each bounded delete.
    await recordPostRelatedUrlPublicationChanges(query, postIds)
  }
}
