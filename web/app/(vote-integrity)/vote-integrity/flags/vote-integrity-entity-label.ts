import type { VoteIntegrityFlag } from '@/types/vote-integrity'
import type { useTranslations } from '@/lib/i18n/use-translations'

export function getEntityLabel(
  flag: VoteIntegrityFlag,
  t: ReturnType<typeof useTranslations>,
): string {
  if (flag.post_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.postId_2f8c4a91', {
      id: flag.post_id.slice(0, 8),
    })
  }
  if (flag.topic_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.topicId_7b3e9c02', {
      id: flag.topic_id.slice(0, 8),
    })
  }
  if (flag.hostname_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.hostnameId_5d1a6f83', {
      id: flag.hostname_id.slice(0, 8),
    })
  }
  if (flag.rss_feed_item_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.rssItemId_9c4b2e74', {
      id: flag.rss_feed_item_id.slice(0, 8),
    })
  }
  if (flag.entity_relation_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.entityRelId_3a7d8f15', {
      id: flag.entity_relation_id.slice(0, 8),
    })
  }
  if (flag.agent_moderation_id) {
    return t('extracted.flags.voteIntegrityFlagsTable.agentModId_6e2c9b06', {
      id: flag.agent_moderation_id.slice(0, 8),
    })
  }
  return t('extracted.flags.voteIntegrityFlagsTable.unknown_8f4a1d97')
}
