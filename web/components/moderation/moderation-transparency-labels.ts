import type { MessageKey } from '@ts-shared/ui-messages'
import type { ModerationTransparencyMetric } from '@/types/moderation-analytics'
import type { useTranslations } from '@/lib/i18n/use-translations'

type Translate = ReturnType<typeof useTranslations>

const METRIC_LABEL_KEYS: Record<ModerationTransparencyMetric, MessageKey> = {
  appeals: 'extracted.moderationAnalytics.moderationTransparencyPanel.appeals_3ff7e7d5',
  automated_moderation:
    'extracted.moderationAnalytics.moderationTransparencyPanel.automatedModeration_0b1d4f1f',
  moderation_actions:
    'extracted.moderationAnalytics.moderationTransparencyPanel.moderationActions_6962f511',
  reports: 'extracted.moderationAnalytics.moderationTransparencyPanel.reports_dacca3cb',
}

const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  accept: 'extracted.appeals.appealRow.accept_89713b9c',
  activate_restriction:
    'extracted.moderationAnalytics.moderationTransparencyPanel.activateRestriction_2f9a4f31',
  agent_moderation:
    'extracted.moderationAnalytics.moderationTransparencyPanel.agentModeration_3c1e8b62',
  approve: 'extracted.moderationAnalytics.moderationTransparencyPanel.approve_3a8e5c42',
  ban: 'extracted.moderationAnalytics.moderationTransparencyPanel.ban_4b7d6e53',
  change_role: 'extracted.moderationAnalytics.moderationTransparencyPanel.changeRole_5c6f7a64',
  community_ai: 'extracted.moderationAnalytics.moderationTransparencyPanel.communityAi_05e3ed5f',
  deny: 'extracted.appeals.appealRow.deny_05a2d733',
  dismiss_appeal:
    'extracted.moderationAnalytics.moderationTransparencyPanel.dismissAppeal_6d5e8b75',
  dismiss_report:
    'extracted.moderationAnalytics.moderationTransparencyPanel.dismissReport_7e4f9c86',
  harassment: 'extracted.shared.reportReasonFieldset.harassment_98a7655d',
  illegal_content: 'extracted.shared.reportReasonFieldset.illegalContent_641a0f48',
  lift_ban: 'extracted.moderationAnalytics.moderationTransparencyPanel.liftBan_8f3a1d97',
  lift_restriction:
    'extracted.moderationAnalytics.moderationTransparencyPanel.liftRestriction_9a2b4e18',
  lock: 'extracted.moderationAnalytics.moderationTransparencyPanel.lock_1b3c5f29',
  misinformation: 'extracted.shared.reportReasonFieldset.misinformation_34d52e35',
  openai_omni:
    'extracted.moderationAnalytics.moderationTransparencyPanel.openAiModeration_4d2f9c73',
  other: 'extracted.shared.reportReasonFieldset.other_f97e9da0',
  pin: 'extracted.moderationAnalytics.moderationTransparencyPanel.pin_2c4d6a30',
  post_clearance_reject:
    'extracted.moderationAnalytics.moderationTransparencyPanel.postClearanceRejection_5e3a1d84',
  reduce: 'extracted.appeals.appealRow.reduce_42412678',
  reject: 'extracted.moderationAnalytics.moderationTransparencyPanel.reject_3d5e7b41',
  remove: 'extracted.moderationAnalytics.moderationTransparencyPanel.remove_4e6f8c52',
  remove_member: 'extracted.moderationAnalytics.moderationTransparencyPanel.removeMember_5f7a9d63',
  resolve_appeal:
    'extracted.moderationAnalytics.moderationTransparencyPanel.resolveAppeal_6a8b1e74',
  resolve_report:
    'extracted.moderationAnalytics.moderationTransparencyPanel.resolveReport_7b9c2f85',
  spam: 'extracted.shared.reportReasonFieldset.spam_94a9eac4',
  spam_detection:
    'extracted.moderationAnalytics.moderationTransparencyPanel.spamDetection_6f4b2e95',
  suspend: 'extracted.moderationAnalytics.moderationTransparencyPanel.suspend_8c1d3a96',
  tag: 'extracted.moderationAnalytics.moderationTransparencyPanel.tag_9d2e4b17',
  unlock: 'extracted.moderationAnalytics.moderationTransparencyPanel.unlock_ae3f5c28',
  unpin: 'extracted.moderationAnalytics.moderationTransparencyPanel.unpin_bf4a6d39',
  unsuspend: 'extracted.moderationAnalytics.moderationTransparencyPanel.unsuspend_c0b5e7a40',
  vote_manipulation: 'extracted.shared.reportReasonFieldset.voteManipulation_6612069f',
  warn: 'extracted.moderationAnalytics.moderationTransparencyPanel.warn_d1c6f8b51',
}

const FALLBACK_LABEL_KEY = 'extracted.shared.reportReasonFieldset.other_f97e9da0'

export function moderationTransparencyMetricLabel(
  metric: ModerationTransparencyMetric,
  t: Translate,
) {
  const key = (METRIC_LABEL_KEYS as Partial<Record<string, MessageKey>>)[metric]
  return t(key ?? FALLBACK_LABEL_KEY)
}

export function moderationTransparencyCategoryLabel(category: string, t: Translate) {
  return t(CATEGORY_LABEL_KEYS[category] ?? FALLBACK_LABEL_KEY)
}
