import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createCopyrightStatementDeliveryInTransaction } from './statement-delivery.mts'
import { selectCopyrightStatementFacts } from './statement-of-reasons-facts.mts'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightRestorationCause,
  type CopyrightRestorationOutcome,
} from './statement-of-reasons.mts'

export async function selectCopyrightTargetPosters(
  targetId: string,
  transaction: TransactionQuery,
): Promise<{ user_id: string }[]> {
  const { rows } = await transaction<{ user_id: string }>(sql`/* selectCopyrightTargetPosters */
    SELECT DISTINCT post.created_by_id AS user_id
    FROM copyright_notice_targets target
    JOIN media_placements placement ON target.placement_id = placement.id
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE target.id = ${targetId}
  `)
  return rows
}

/** Every actual poster receives immutable reasons through both delivery channels. */
export async function createCopyrightPosterNoticesInTransaction(
  input: {
    noticeId: string
    targetId: string
    restrictionId: string
    event: 'restricted' | 'confirmed' | 'reversed' | 'restriction_ended'
    restorationCause?: CopyrightRestorationCause
    restorationOutcome?: CopyrightRestorationOutcome
  },
  transaction: TransactionQuery,
): Promise<void> {
  const facts = await selectCopyrightStatementFacts(input.noticeId, transaction, input)
  const statement = buildCopyrightStatementOfReasons({
    ...facts,
    audience: 'poster',
    event: input.event,
    automatedDecision: input.event === 'restricted' && facts.automatedDecision,
    restorationCause: input.restorationCause,
    restorationOutcome: input.restorationOutcome,
  })
  const prefix =
    input.event === 'restricted'
      ? 'copyright-restriction'
      : input.event === 'restriction_ended'
        ? 'copyright-restriction-lift'
        : 'copyright-restriction-review'
  const deliveryKind =
    input.event === 'restricted'
      ? 'poster_restriction_notice'
      : input.event === 'restriction_ended'
        ? 'poster_restoration_notice'
        : 'poster_review_notice'
  for (const poster of await selectCopyrightTargetPosters(input.targetId, transaction)) {
    // oxlint-disable-next-line no-await-in-loop -- each poster has independent durable delivery evidence.
    await createCopyrightStatementDeliveryInTransaction(
      {
        noticeId: input.noticeId,
        recipientUserId: poster.user_id,
        recipientRole: 'poster',
        deliveryKind,
        correspondenceKind:
          input.event === 'restricted'
            ? 'restriction_notice'
            : input.event === 'restriction_ended'
              ? 'restoration_notice'
              : 'decision_notice',
        key: `${prefix}:${input.restrictionId}:poster:${poster.user_id}`,
        text: statement.text,
      },
      transaction,
    )
  }
}
