import '@services/urls/register-blocked-hostname-guard'
import '@services/referral-program-link-validations/register-referral-link-guard'
import '../register-post-related-urls-guard.mts'
import { read, write, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

export async function getPostRecoverySourceUrlIds(
  postId: string,
  options: QueryOptions = {},
): Promise<string[]> {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery<{ creation_source_url_id: string | null }>(
    sql`/* getPostRecoverySourceUrlIds */
      SELECT creation_source_url_id
      FROM posts
      WHERE id = ${postId}
      LIMIT 1`,
    options,
  )
  const creationSourceUrlId = rows[0]?.creation_source_url_id
  if (creationSourceUrlId !== null && creationSourceUrlId !== undefined) {
    return [creationSourceUrlId]
  }
  const legacyRows = await runQuery<{ object_id: string }>(
    sql`/* getLegacyPostRecoverySourceUrlIds */
      SELECT object_id
      FROM relation__post__related__url
      WHERE subject_id = ${postId} AND deleted_at IS NULL AND votes_score_net > 0`,
    options,
  )
  return legacyRows.rows.map(row => row.object_id)
}

export async function getPostRelatedUrlIds(
  postId: string,
  options: QueryOptions = {},
): Promise<string[]> {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery<{ object_id: string }>(
    sql`/* getPostRelatedUrlIds */
      SELECT object_id
      FROM relation__post__related__url
      WHERE subject_id = ${postId}
        AND deleted_at IS NULL
        AND votes_score_net > 0`,
    options,
  )
  return rows.map(row => row.object_id)
}

export async function persistPostSourceUrlRelation(
  query: TransactionQuery,
  creator: PrivateUser,
  postId: string,
  sourceUrlId: string | undefined,
): Promise<void> {
  if (!sourceUrlId) return
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'url',
    predicate: 'related',
  })
  await writeEntityRelations(
    relation,
    creator,
    [{ subject: { id: postId }, object: { id: sourceUrlId } }],
    { query },
  )
}
