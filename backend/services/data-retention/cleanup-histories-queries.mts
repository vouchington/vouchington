import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import type { HistoryKind } from './cleanup-histories-candidates.mts'

/** Mutate only candidate ids; per-key probes stop at the owner-approved rank. */
export async function mutatePage(
  query: TransactionQuery,
  kind: HistoryKind,
  ids: string[],
  cutoff: Date,
): Promise<number> {
  switch (kind) {
    case 'dynamic_configuration_revisions': {
      const result = await query(
        `/* deleteOldConfigHistoryPage */
         DELETE FROM dynamic_configuration_revisions AS old
         WHERE old.id = ANY($1::uuid[])
           AND (SELECT count(*) FROM LATERAL (
             SELECT 1 FROM dynamic_configuration_revisions AS newer
             WHERE newer.configuration_key = old.configuration_key AND newer.id > old.id
             ORDER BY newer.id ASC LIMIT 50
           ) AS fixed_probe) = 50`,
        [ids],
      )
      return result.rowCount ?? 0
    }
    case 'rss_feed_setting_changes': {
      const result = await query(
        `/* deleteOldRssSettingHistoryPage */
         DELETE FROM rss_feed_setting_changes AS old
         WHERE old.id = ANY($1::uuid[])
           AND (
             SELECT newer.id FROM rss_feed_setting_changes AS newer
             WHERE newer.rss_feed_id = old.rss_feed_id
               AND newer.change_type = old.change_type AND newer.id > old.id
             ORDER BY newer.id ASC LIMIT 1
           ) < $2::uuid`,
        [ids, getMinUUIDv7ForDate(cutoff)],
      )
      return result.rowCount ?? 0
    }
    case 'fediverse_instance_integration_changes': {
      const result = await query(
        `/* deleteOldFediverseHistoryPage */
         DELETE FROM fediverse_instance_integration_changes AS old
         WHERE old.id = ANY($1::uuid[])
           AND (
             SELECT newer.id FROM fediverse_instance_integration_changes AS newer
             WHERE newer.topic_id = old.topic_id AND newer.id > old.id
             ORDER BY newer.id ASC LIMIT 1
           ) < $2::uuid`,
        [ids, getMinUUIDv7ForDate(cutoff)],
      )
      return result.rowCount ?? 0
    }
    case 'community_agent_prompt_revisions': {
      const result = await query(
        `/* deleteOldPromptHistoryPage */
         DELETE FROM community_agent_prompt_revisions AS old
         WHERE old.id = ANY($1::uuid[])
           AND (SELECT count(*) FROM LATERAL (
             SELECT 1 FROM community_agent_prompt_revisions AS newer
             WHERE newer.community_id = old.community_id AND newer.id > old.id
             ORDER BY newer.id ASC LIMIT 200
           ) AS fixed_probe) = 200`,
        [ids],
      )
      return result.rowCount ?? 0
    }
    case 'followed_user_import_requests': {
      const result = await query(
        `/* deleteFollowedImportHistoryPage */
         DELETE FROM user_import_requests
         WHERE id = ANY($1::uuid[])
           AND followed_at IS NOT NULL AND followed_at < $2::timestamptz`,
        [ids, getRetentionCutoffDate(90, cutoff)],
      )
      return result.rowCount ?? 0
    }
    case 'pending_user_import_requests': {
      const result = await query(
        `/* deletePendingImportHistoryPage */
         DELETE FROM user_import_requests
         WHERE id = ANY($1::uuid[]) AND followed_at IS NULL
           AND id < $2::uuid`,
        [ids, getMinUUIDv7ForDate(cutoff)],
      )
      return result.rowCount ?? 0
    }
    case 'referral_attribution_scrub': {
      const result = await query(
        `/* scrubReferralHistoryPage */
         UPDATE session_referral_attributions
         SET landing_url = NULL, utm_source = NULL, utm_medium = NULL,
             utm_campaign = NULL, utm_content = NULL
         WHERE id = ANY($1::uuid[])
           AND (landing_url IS NOT NULL OR utm_source IS NOT NULL
             OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL
             OR utm_content IS NOT NULL)`,
        [ids],
      )
      return result.rowCount ?? 0
    }
    case 'referral_attribution_expiry': {
      const result = await query(
        `/* expireReferralHistoryPage */
         DELETE FROM session_referral_attributions WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      return result.rowCount ?? 0
    }
  }
}
