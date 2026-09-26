import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import {
  lockImageAssetAdmission,
  markImageDeliveryAuthorityStarted,
} from '@services/media-delivery-safety'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { runSequentially } from '@modules/utils/run-sequentially'

export async function lockActivePostAuthorImageAdmission(
  query: TransactionQuery,
  creatorId: string,
  imageIds: string[],
): Promise<void> {
  await runSequentially([
    () => lockImageAssetAdmission(imageIds, query),
    () => markImageDeliveryAuthorityStarted(query),
    () => lockAuthorPublicationLifecycle(query, creatorId),
  ])
  return assertActivePostAuthor(query, creatorId)
}

export async function assertActivePostAuthor(
  query: TransactionQuery,
  creatorId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    sql`/* createPost:activeAuthor */
      SELECT id
      FROM users
      WHERE id = ${creatorId}
        AND deleted_at IS NULL`,
  )
  if (!rows[0]) throw createHttpError(409, 'Author is not active')
}
