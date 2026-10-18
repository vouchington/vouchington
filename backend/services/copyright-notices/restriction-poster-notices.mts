import type { TransactionQuery } from '@data-stores/psql/types'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'
import type { CopyrightStatementFacts } from './statement-of-reasons-facts.mts'
import {
  buildCopyrightStatementOfReasons,
  type CopyrightRestorationCause,
  type CopyrightRestorationOutcome,
} from './statement-of-reasons.mts'
import { selectCopyrightDeliveryInputs } from './delivery-inputs.mts'
import type { PosterPurpose, TargetPoster } from './target-posters.mts'

export type CopyrightPosterNoticeInput = {
  noticeId: string
  targetId: string
  restrictionId: string
  event: 'restricted' | 'confirmed' | 'reversed' | 'restriction_ended'
  restorationCause?: CopyrightRestorationCause
  restorationOutcome?: CopyrightRestorationOutcome
}

/** Every actual poster receives immutable reasons through both delivery channels. */
export async function createCopyrightPosterNoticesInTransaction(
  input: CopyrightPosterNoticeInput,
  transaction: TransactionQuery,
): Promise<void> {
  const {
    facts: [facts],
    parties,
  } = await selectCopyrightDeliveryInputs(input.noticeId, transaction, {
    authorities: [input],
    targetIds: [input.targetId],
    purposes: posterPurposes(input),
  })
  await createCopyrightStatementDeliveriesInTransaction(
    buildCopyrightPosterNoticeDeliveries(input, facts, parties),
    transaction,
  )
}

/** The purposes whose recipients one restriction event needs. */
export function posterPurposes(input: CopyrightPosterNoticeInput): PosterPurpose[] {
  const recipients = input.restorationCause === 'administrator_lift' ? 'inform' : 'notify'
  return input.event === 'restricted' ? ['notify', 'inform'] : [recipients]
}

/**
 * The deliveries a restriction event owes its posters, plus the community owners informed of a
 * new restriction. `facts` are read for the same restriction and target by the caller.
 */
export function buildCopyrightPosterNoticeDeliveries(
  input: CopyrightPosterNoticeInput,
  facts: CopyrightStatementFacts,
  allParties: readonly TargetPoster[],
): CopyrightStatementDeliveryInput[] {
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
  const posterPurpose = input.restorationCause === 'administrator_lift' ? 'inform' : 'notify'
  const parties = allParties.filter(party => party.target_id === input.targetId)
  const recipients = parties.filter(party => party.purpose === posterPurpose)
  const deliveries: CopyrightStatementDeliveryInput[] = recipients.map(poster => ({
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
  }))
  if (input.event === 'restricted') {
    for (const owner of parties.filter(party => party.purpose === 'inform')) {
      deliveries.push({
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
      })
    }
  }
  return deliveries
}
