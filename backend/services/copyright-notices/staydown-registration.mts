import type { OwnedTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueStaydownHash } from '@queues/images/enqueues'
import sql from 'sql-template-strings'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'
import { syncCopyrightRepeatInfringerIncidents } from './repeat-infringer-incidents.mts'
import { anyReversalSourceSql } from './restriction-reversal-sources-sql.mts'

/**
 * Registers the images of a case's moderator-confirmed, still-active restrictions for staydown and
 * returns the images newly registered. A restriction counts only when a moderator confirmed it
 * (accepting the notice, completing mandatory review, or confirming on appeal) and nobody
 * reversed it; an automated provisional withholding is never registered. Does nothing while
 * `copyright.staydownMatching` is off. The caller enqueues the hash job after its commit.
 */
async function registerCopyrightStaydownEntriesInTransaction(
  noticeId: string,
  query: TransactionQuery,
): Promise<string[]> {
  if (!(await isCopyrightStaydownMatchingEnabled())) return []
  const { rows } = await query<{ image_id: string }>(
    sql`/* registerCopyrightStaydownEntries */
    INSERT INTO copyright_staydown_entries (copyright_restriction_id, image_id, sha_256)
    SELECT restriction.id, target_image.image_id, image.sha_256
    FROM copyright_notice_targets target
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    JOIN copyright_notice_target_images target_image ON target_image.copyright_notice_target_id = target.id
    JOIN images image ON image.id = target_image.image_id
    WHERE target.copyright_notice_id = ${noticeId}
      AND restriction.lifted_at IS NULL
      AND image.sha_256 IS NOT NULL
      AND (
        restriction.human_review_action = 'confirm'
        OR EXISTS (
          SELECT 1 FROM copyright_notice_appeal_reviews review
          WHERE review.copyright_restriction_id = restriction.id AND review.action = 'confirm'
        )
      )
      AND NOT `.append(anyReversalSourceSql).append(sql`
    ON CONFLICT (copyright_restriction_id) DO NOTHING
    RETURNING image_id
  `),
  )
  return rows.map(row => row.image_id)
}

/**
 * What a moderator's confirmation changes on the case besides the restriction itself: repeat-infringer
 * incidents and the staydown registry. Returns the images newly registered for staydown.
 */
export async function applyCopyrightConfirmationConsequencesInTransaction(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<string[]> {
  await syncCopyrightRepeatInfringerIncidents(noticeId, transaction)
  return registerCopyrightStaydownEntriesInTransaction(noticeId, transaction)
}

/** Queues the perceptual-hash fill for newly registered images; the exact SHA-256 already matches. */
export function enqueueCopyrightStaydownHashes(imageIds: string[]): void {
  for (const imageId of new Set(imageIds)) void enqueueStaydownHash(imageId, 'registration')
}

/** Lifting a restriction for any reason removes its entry and, by cascade, its pending matches. */
export async function removeCopyrightStaydownEntryInTransaction(
  restrictionId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* removeCopyrightStaydownEntry */
    DELETE FROM copyright_staydown_entries WHERE copyright_restriction_id = ${restrictionId}
  `)
}
