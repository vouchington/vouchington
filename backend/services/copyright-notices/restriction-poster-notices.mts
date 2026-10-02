import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'

/** Every poster of a restricted target gets an in-app and an email restriction notice. */
export async function createCopyrightPosterRestrictionNoticesInTransaction(
  input: { noticeId: string; targetId: string; restrictionId: string },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows: posterRows } = await transaction<{
    user_id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:posters */
    SELECT DISTINCT post.created_by_id AS user_id
    FROM copyright_notice_targets target
    JOIN media_placements placement
      ON target.placement_id = placement.id
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE target.id = ${input.targetId}
  `)
  for (const poster of posterRows) {
    // oxlint-disable-next-line no-await-in-loop -- each unique recipient has an independent legal delivery obligation.
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: null,
        recipientUserId: poster.user_id,
        recipientRole: 'poster',
        deliveryKind: 'poster_restriction_notice',
        channel: 'in_app',
        idempotencyKey: `copyright-restriction:${input.restrictionId}:poster:${poster.user_id}`,
      },
      transaction,
    )
    // oxlint-disable-next-line no-await-in-loop -- correspondence follows its recipient's durable in-app obligation.
    const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceKind: 'restriction_notice',
        bodyText: `Material associated with your account has been restricted in response to copyright case ${input.noticeId}. You may submit an appeal or counter-notice through the case page.`,
      },
      transaction,
    )
    // oxlint-disable-next-line no-await-in-loop -- each affected poster has independent legal email evidence and delivery.
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: poster.user_id,
        recipientRole: 'poster',
        deliveryKind: 'poster_restriction_notice',
        channel: 'email',
        idempotencyKey: `copyright-restriction:${input.restrictionId}:poster:${poster.user_id}:email`,
      },
      transaction,
    )
  }
}
