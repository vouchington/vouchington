'use client'

import { useTranslations } from '@/lib/i18n/use-translations'

export function useModerationTargetLabel(): (label: string) => string {
  const t = useTranslations()
  return label => {
    switch (label) {
      case '[deleted content]':
        return t('shared.moderation.deletedContent')
      case '[Private content]':
        return t('shared.moderation.privateContent')
      case 'post':
        return t('shared.moderation.postEntityType')
      case 'comment':
        return t('extracted.comments.commentReplyForm.comment_44f5e3fb')
      case 'user':
        return t('extracted.flags.integrityPenalties.user_77edb64f')
      case 'hostname':
      case 'url_hostname':
        return t('extracted.create.createTopicClient.hostname_2db53355')
      case 'rss_feed_item':
        return t('extracted.lists.addToListMenuItem.feedItem_03b8b4e7')
      case 'topic':
        return t('extracted.landingPagesManager.itemPickerFields.topic_7e61847d')
      case 'review':
        return t('extracted.disputes.disputesTable.review_aff0766a')
      case 'agent_moderation':
        return t(
          'extracted.moderationAnalytics.moderationTransparencyPanel.automatedModeration_0b1d4f1f',
        )
      case 'mass_report_suspected':
        return t('extracted.flags.integrityActions.massReportSuspected_cc227ce2')
      case 'velocity_spike':
        return t('extracted.flags.integrityActions.velocitySpike_5be6d539')
      case 'ip_correlation':
        return t('extracted.flags.integrityActions.ipCorrelation_a7083d7c')
      default:
        return label
    }
  }
}
