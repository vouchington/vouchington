import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import { getReferralLinkCleanupBatchSize } from './work-limits.mts'

/**
 * Internal lifecycle helpers for unfurled child referral links. These bypass the
 * public immutability guard in update.mts/delete.mts/activate.mts on purpose — they
 * are the only sanctioned way children are ever soft-deleted or reconciled, called
 * from the unfurl processor, the parent-delete cascade, and the membership
 * downgrade/expiry cleanup path.
 */

export async function softDeleteChildrenOfParent(
  parentLinkId: string,
  options?: QueryOptions,
): Promise<void> {
  validateUUID(parentLinkId)

  await write(
    sql`/* softDeleteChildrenOfParent */
      UPDATE user_referral_program_links
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE parent_link_id = ${parentLinkId}
        AND deleted_at IS NULL
    `,
    options,
  )
}

export async function softDeleteChildrenForUser(
  userId: string,
  options?: QueryOptions,
): Promise<void> {
  validateUUID(userId)

  const batchSize = getReferralLinkCleanupBatchSize()
  // This synchronous lifecycle operation must finish the whole user's cleanup before returning.
  /* oxlint-disable no-await-in-loop -- ordered page operations depend on the preceding page */
  for (;;) {
    // no-mistakes-disable-next-line query-reached-per-item: each iteration updates one validated child-link page; this synchronous lifecycle operation must complete before returning
    const { rowCount } = await write(
      sql`/* softDeleteChildrenForUser */
        UPDATE user_referral_program_links
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
          AND parent_link_id IS NOT NULL
          AND deleted_at IS NULL
          AND id IN (
          SELECT id FROM user_referral_program_links
          WHERE user_id = ${userId}
            AND parent_link_id IS NOT NULL
            AND deleted_at IS NULL
          ORDER BY referral_program_topic_id, url_id
          LIMIT ${batchSize}
          FOR UPDATE
        )
      `,
      options,
    )
    if (!rowCount) break
  }
  /* oxlint-enable no-await-in-loop */
}

/** Soft-deletes any active child of `parentLinkId` whose url_id is not in `keepUrlIds`. */
export async function reconcileChildrenForParent(
  parentLinkId: string,
  keepUrlIds: string[],
  options?: QueryOptions,
): Promise<void> {
  validateUUID(parentLinkId)
  keepUrlIds.forEach(validateUUID)

  await write(
    sql`/* reconcileChildrenForParent */
      UPDATE user_referral_program_links
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE parent_link_id = ${parentLinkId}
        AND deleted_at IS NULL
        AND NOT (url_id = ANY(${keepUrlIds}::uuid[]))
    `,
    options,
  )
}
