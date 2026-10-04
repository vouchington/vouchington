import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createCopyrightStatementDeliveryInTransaction } from './statement-delivery.mts'
import { selectCopyrightStatementFacts } from './statement-of-reasons-facts.mts'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightRestorationCause,
  type CopyrightRestorationOutcome,
} from './statement-of-reasons.mts'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export async function selectCopyrightTargetPosters(
  targetId: string,
  transaction: TransactionQuery,
  purpose: 'notify' | 'inform' = 'notify',
): Promise<
  { user_id: string; recipient_role: 'poster' | 'informed_owner'; target_path: string | null }[]
> {
  const statement = sql`/* selectCopyrightTargetPosters */
    SELECT DISTINCT party.user_id, ${purpose === 'inform' ? 'informed_owner' : 'poster'}::text AS recipient_role,
      CASE WHEN ${purpose === 'inform'} THEN '/communities/' || COALESCE(community.slug, community.id::text)
        ELSE NULL END AS target_path
    FROM copyright_notice_targets target
    LEFT JOIN image_surface_placements surface ON surface.placement_id = target.placement_id
    LEFT JOIN communities community ON community.id = surface.community_id
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql(purpose))
  statement.append(sql` party
    WHERE target.id = ${targetId}
    ORDER BY user_id
  `)
  const { rows } = await transaction<{
    user_id: string
    recipient_role: 'poster' | 'informed_owner'
    target_path: string | null
  }>(statement)
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
  const recipients =
    input.restorationCause === 'administrator_lift'
      ? await selectCopyrightTargetPosters(input.targetId, transaction, 'inform')
      : await selectCopyrightTargetPosters(input.targetId, transaction)
  for (const poster of recipients) {
    // oxlint-disable-next-line no-await-in-loop -- each poster has independent durable delivery evidence.
    await createCopyrightStatementDeliveryInTransaction(
      {
        noticeId: input.noticeId,
        recipientUserId: poster.user_id,
        recipientRole: poster.recipient_role,
        deliveryKind,
        correspondenceKind:
          input.event === 'restricted'
            ? 'restriction_notice'
            : input.event === 'restriction_ended'
              ? 'restoration_notice'
              : 'decision_notice',
        key: `${prefix}:${input.restrictionId}:${poster.recipient_role}:${poster.user_id}`,
        text: statement.text,
        targetPath: poster.target_path ?? undefined,
      },
      transaction,
    )
  }
  if (input.event === 'restricted') {
    const informedOwners = await selectCopyrightTargetPosters(input.targetId, transaction, 'inform')
    for (const owner of informedOwners) {
      // oxlint-disable-next-line no-await-in-loop -- one immutable delivery pair per community owner.
      await createCopyrightStatementDeliveryInTransaction(
        {
          noticeId: input.noticeId,
          recipientUserId: owner.user_id,
          recipientRole: 'informed_owner',
          deliveryKind: 'owner_information_notice',
          correspondenceKind: 'restriction_notice',
          key: `copyright-owner-information:${input.restrictionId}:${owner.user_id}`,
          text:
            recipients.length > 0
              ? 'An image on a community you own was withheld after a copyright notice. The member who set it has been told.'
              : 'An image on a community you own was withheld after a copyright notice.',
          targetPath: owner.target_path ?? undefined,
        },
        transaction,
      )
    }
  }
}
