import type { NotificationKind } from '@/types/api-responses'
import {
  communityActivityDigest,
  communityApplicationApproved,
  communityApplicationRejected,
  communityOwnershipReceived,
  communityOwnershipTransferredAway,
  communityRoleChanged,
} from './notification-text-community'
import {
  copyrightClaimantDecisionNotice,
  copyrightClaimantReceipt,
  copyrightOwnerInformationNotice,
  copyrightPosterRestorationNotice,
  copyrightPosterRestrictionNotice,
  copyrightPosterReviewNotice,
  copyrightRedressDecisionNotice,
  copyrightStatusUpdate,
} from './notification-text-copyright'
import {
  communityBan,
  criticalModerationAlert,
  moderationAppealResolved,
  reportReviewed,
  reviewActionedNote,
  reviewActionedRemoved,
  reviewDisputeResolved,
  userWarning,
} from './notification-text-moderation'
import {
  postManualSend,
  postNew,
  postRemoved,
  postReply,
  rssItemManualSend,
  rssItemNew,
} from './notification-text-posts'
import {
  directMessage,
  follow,
  followReferralSignup,
  householdInvitation,
  modmail,
  referralClick,
  referralSignup,
} from './notification-text-social'
import type {
  NotificationText,
  NotificationTextInput,
  NotificationTextRenderer,
} from './notification-text-types'

/** Exhaustive: a new `NotificationKind` fails to type-check until it has copy here. */
const RENDERERS: Record<NotificationKind, NotificationTextRenderer> = {
  post_new: postNew,
  post_reply: postReply,
  post_manual_send: postManualSend,
  post_removed: postRemoved,
  rss_item_new: rssItemNew,
  rss_item_manual_send: rssItemManualSend,
  follow,
  follow_referral_signup: followReferralSignup,
  referral_signup: referralSignup,
  referral_click: referralClick,
  report_reviewed: reportReviewed,
  critical_moderation_alert: criticalModerationAlert,
  review_dispute_resolved: reviewDisputeResolved,
  review_actioned_removed: reviewActionedRemoved,
  review_actioned_note: reviewActionedNote,
  user_warning: userWarning,
  moderation_appeal_resolved: moderationAppealResolved,
  community_ban: communityBan,
  direct_message: directMessage,
  modmail,
  community_application_approved: communityApplicationApproved,
  community_application_rejected: communityApplicationRejected,
  community_role_changed: communityRoleChanged,
  community_ownership_received: communityOwnershipReceived,
  community_ownership_transferred_away: communityOwnershipTransferredAway,
  community_activity_digest: communityActivityDigest,
  household_invitation: householdInvitation,
  copyright_claimant_receipt: copyrightClaimantReceipt,
  copyright_status_update: copyrightStatusUpdate,
  copyright_poster_restriction_notice: copyrightPosterRestrictionNotice,
  copyright_poster_review_notice: copyrightPosterReviewNotice,
  copyright_poster_restoration_notice: copyrightPosterRestorationNotice,
  copyright_owner_information_notice: copyrightOwnerInformationNotice,
  copyright_claimant_decision_notice: copyrightClaimantDecisionNotice,
  copyright_redress_decision_notice: copyrightRedressDecisionNotice,
}

/** Renders the localized title and body of a notification from its kind, params and hydrated facts. */
export function renderNotificationText(input: NotificationTextInput): NotificationText {
  return RENDERERS[input.notification.kind](input)
}
