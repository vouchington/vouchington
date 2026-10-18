import sql from 'sql-template-strings'
import { moderationAiConfig } from '@services/moderation-ai-config'
import { reportTargetAvailableSql } from './target-metadata.mts'

/** Match the automatic report agent's current community gate and target availability. */
export function reportAutomaticJudgementEnabledSql() {
  const communityEnabled = moderationAiConfig.getFields().community_judgement_enabled
  return sql`(`.append(reportTargetAvailableSql()).append(sql` AND (r.post_id IS NULL OR
      (target_post.id IS NOT NULL AND (target_post.community_id IS NULL OR ${communityEnabled}))))`)
}
