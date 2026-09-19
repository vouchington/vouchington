import type {
  CopyrightHumanReviewAction,
  CopyrightNoticeRecord,
  MemberCopyrightNotice,
} from './types.mts'

/** The member contract is deliberately allowlisted: no legal contact, raw evidence, or free text. */
export function redactCopyrightNoticeForMember(
  notice: CopyrightNoticeRecord,
  {
    visibleTargetReference,
    publicClaimant,
    activeRestrictionCount,
    visibleTargetHumanReviewAction,
  }: {
    visibleTargetReference: string | null
    publicClaimant: { userId: string; displayName: string | null } | null
    activeRestrictionCount: number
    visibleTargetHumanReviewAction: CopyrightHumanReviewAction | null
  },
): MemberCopyrightNotice {
  if (!notice.accepted_at) throw new Error('Unaccepted copyright notices are not member-visible')

  return {
    id: notice.id,
    jurisdiction: notice.jurisdiction,
    received_at: notice.received_at,
    accepted_at: notice.accepted_at,
    target_reference: visibleTargetReference,
    claimant:
      notice.claimant_user_id && publicClaimant?.userId === notice.claimant_user_id
        ? { user_id: publicClaimant.userId, display_name: publicClaimant.displayName }
        : null,
    allegation_label: 'copyright allegation',
    review_outcome: visibleTargetHumanReviewAction,
    restriction_label: restrictionLabel(activeRestrictionCount, visibleTargetHumanReviewAction),
  }
}

function restrictionLabel(
  activeRestrictionCount: number,
  humanReviewAction: MemberCopyrightNotice['review_outcome'],
): MemberCopyrightNotice['restriction_label'] {
  if (activeRestrictionCount > 0 && !humanReviewAction)
    return 'provisionally withheld pending human review'
  if (activeRestrictionCount > 0) return 'restriction active'
  return 'no restriction recorded'
}
