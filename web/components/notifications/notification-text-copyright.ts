import { buildAbsoluteUrl } from '@/lib/seo/constants'
import {
  hydratedPublicText,
  type NotificationT,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

function withSummary(
  { t, notification, hydration }: NotificationTextInput,
  title: string,
  fallbackBody: string,
): NotificationText {
  const summary = hydratedPublicText(hydration, notification.copyright_notice_delivery_work_item_id)
  const aiAssisted = notification.params.ai_assisted === true
  const body = summary || fallbackBody
  return {
    title,
    body: aiAssisted ? `${body}\n\n${t('notifications.kind.copyright_ai_assisted')}` : body,
  }
}

function decisionFallback(t: NotificationT, jurisdiction: string | undefined): string {
  if (jurisdiction === 'us_dmca') {
    return t('notifications.kind.copyright_claimant_decision_notice.body.us', {
      newNoticeUrl: buildAbsoluteUrl('/copyright/notices/new'),
      designatedAgentUrl: buildAbsoluteUrl('/copyright/designated-agent'),
    })
  }
  return jurisdiction === 'eu_dsa'
    ? t('notifications.kind.copyright_claimant_decision_notice.body.eu')
    : t('notifications.kind.copyright_claimant_decision_notice.body.other')
}

export function copyrightClaimantReceipt(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_claimant_receipt.title'),
    t('notifications.kind.copyright_claimant_receipt.body'),
  )
}

export function copyrightStatusUpdate(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_status_update.title'),
    t('notifications.kind.copyright_status_update.body'),
  )
}

export function copyrightPosterRestrictionNotice(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_poster_restriction_notice.title'),
    t('notifications.kind.copyright_poster_restriction_notice.body'),
  )
}

export function copyrightPosterReviewNotice(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_poster_review_notice.title'),
    t('notifications.kind.copyright_poster_review_notice.body'),
  )
}

export function copyrightPosterRestorationNotice(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_poster_restoration_notice.title'),
    t('notifications.kind.copyright_poster_restoration_notice.body'),
  )
}

export function copyrightOwnerInformationNotice(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_owner_information_notice.title'),
    t('notifications.kind.copyright_owner_information_notice.body'),
  )
}

export function copyrightClaimantDecisionNotice(input: NotificationTextInput): NotificationText {
  const { t, notification, hydration } = input
  const jurisdiction = notification.copyright_notice_id
    ? hydration.copyright_notices?.[notification.copyright_notice_id]?.jurisdiction
    : undefined
  return withSummary(
    input,
    t('notifications.kind.copyright_claimant_decision_notice.title'),
    decisionFallback(t, jurisdiction),
  )
}

export function copyrightRedressDecisionNotice(input: NotificationTextInput): NotificationText {
  const { t } = input
  return withSummary(
    input,
    t('notifications.kind.copyright_redress_decision_notice.title'),
    t('notifications.kind.copyright_redress_decision_notice.body'),
  )
}
