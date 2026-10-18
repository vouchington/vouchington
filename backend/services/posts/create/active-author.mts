import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import {
  imageDeliveryAuthorityStartedSql,
  lockImageAssetAdmission,
} from '@services/media-delivery-safety'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import { runSequentially } from '@modules/utils/run-sequentially'

export async function lockActivePostAuthorImageAdmission(
  query: TransactionQuery,
  creatorId: string,
  imageIds: string[],
): Promise<void> {
  await runSequentially([
    async () => {
      try {
        await lockActiveUserSubjectsForMutation(query, [creatorId])
      } catch (err) {
        if ((err as { code?: string }).code === '23514')
          throw createHttpError(409, 'Author is not active')
        throw err
      }
    },
    () => lockAuthorPublicationLifecycle(query, creatorId),
    () => lockImageAssetAdmission(imageIds, query),
  ])
  return assertActivePostAuthor(query, creatorId)
}

/** Also records the image-delivery "authority started" marker in the same statement. */
export async function assertActivePostAuthor(
  query: TransactionQuery,
  creatorId: string,
): Promise<void> {
  const statement = sql`/* createPost:activeAuthor */
      SELECT id, `
  statement.append(imageDeliveryAuthorityStartedSql())
  statement.append(sql` AS authority_started
      FROM users
      WHERE id = ${creatorId}
        AND deleted_at IS NULL`)
  const { rows } = await query<{ id: string }>(statement)
  if (!rows[0]) throw createHttpError(409, 'Author is not active')
}
