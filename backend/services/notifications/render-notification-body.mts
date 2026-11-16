import { getSiteUrl } from '@modules/utils'
import type { NotificationTranslate, Source } from './render-notification-text.mts'
import type { NotificationHydration } from './types.mts'

const PREFIX = 'notifications.kind.'
const SIMPLE_BODIES = new Set([
  'report_reviewed',
  'review_actioned_removed',
  'review_actioned_note',
  'user_warning',
  'community_ban',
  'household_invitation',
  'copyright_claimant_receipt',
  'copyright_status_update',
  'copyright_poster_restriction_notice',
  'copyright_poster_review_notice',
  'copyright_poster_restoration_notice',
  'copyright_owner_information_notice',
  'copyright_redress_decision_notice',
])

export function simpleBody(
  t: NotificationTranslate,
  notification: Source,
  hydration: NotificationHydration,
  owned: (id: string | null) => string,
): string {
  const { kind } = notification
  const tk = (suffix: string, parameters?: Record<string, string | number>) =>
    t(`${PREFIX}${suffix}`, parameters)
  if (kind === 'review_dispute_resolved') return owned(notification.review_dispute_id)
  if (kind === 'moderation_appeal_resolved') return owned(notification.moderation_appeal_id)
  if (kind === 'user_warning') {
    return owned(notification.user_warning_id) || tk('user_warning.body')
  }
  const summary = owned(notification.copyright_notice_delivery_work_item_id)
  if (kind.startsWith('copyright_')) {
    const fallback =
      kind === 'copyright_claimant_decision_notice'
        ? decisionFallback(t, notification, hydration)
        : tk(`${kind}.body`)
    const body = summary || fallback
    return notification.params.ai_assisted === true
      ? `${body}\n\n${tk('copyright_ai_assisted')}`
      : body
  }
  return SIMPLE_BODIES.has(kind) ? tk(`${kind}.body`) : ''
}

function decisionFallback(
  t: NotificationTranslate,
  notification: Source,
  hydration: NotificationHydration,
): string {
  const jurisdiction = notification.copyright_notice_id
    ? hydration.copyright_notices[notification.copyright_notice_id]?.jurisdiction
    : undefined
  const base = `${PREFIX}copyright_claimant_decision_notice.body`
  if (jurisdiction === 'us_dmca') {
    return t(`${base}.us`, {
      newNoticeUrl: getSiteUrl('/copyright/notices/new'),
      designatedAgentUrl: getSiteUrl('/copyright/designated-agent'),
    })
  }
  return t(jurisdiction === 'eu_dsa' ? `${base}.eu` : `${base}.other`)
}
