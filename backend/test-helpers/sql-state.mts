/* eslint-disable max-lines */
import { read, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

export { beginBoundedTransaction, beginTransaction } from '@data-stores/psql'

export async function isTestPostgresQueryWaitingForLock(queryMarker: string): Promise<boolean> {
  const { rows } = await write<{ waiting: boolean }>(sql`/* isTestPostgresQueryWaitingForLock */
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
        AND query LIKE ${`%${queryMarker}%`}
    ) AS waiting`)
  return rows[0]?.waiting ?? false
}

export function createTestSqlStatement(): SQLStatement {
  return sql`SELECT 1 WHERE true`
}

export async function countDynamicConfigAuditRows(configKey: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countDynamicConfigAuditRowsForTest */
    SELECT COUNT(*) AS count
    FROM dynamic_config_change_logs
    WHERE config_key = ${configKey}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function getDynamicConfigChangeLogRows(configKey: string): Promise<
  Array<{
    config_key: string
    previous_fields: unknown
    next_fields: unknown
    changed_by_id: string
  }>
> {
  const { rows } = await read<{
    config_key: string
    previous_fields: unknown
    next_fields: unknown
    changed_by_id: string
  }>(sql`/* getDynamicConfigChangeLogRowsForTest */
    SELECT config_key, previous_fields, next_fields, changed_by_id
    FROM dynamic_config_change_logs
    WHERE config_key = ${configKey}
    ORDER BY id DESC
  `)
  return rows
}

export async function getCommunityAgentPromptChangeRowsForTest(agentPromptId: string): Promise<
  Array<{
    agent_prompt_id: string
    community_id: string
    changed_by_id: string | null
    action: string
    previous_fields: Record<string, unknown>
    next_fields: Record<string, unknown>
  }>
> {
  const { rows } = await read<{
    agent_prompt_id: string
    community_id: string
    changed_by_id: string | null
    action: string
    previous_fields: Record<string, unknown>
    next_fields: Record<string, unknown>
  }>(sql`/* getCommunityAgentPromptChangeRowsForTest */
    SELECT agent_prompt_id, community_id, changed_by_id, action, previous_fields, next_fields
    FROM community_agent_prompt_changes
    WHERE agent_prompt_id = ${agentPromptId}
    ORDER BY id DESC
  `)
  return rows
}

export async function updateAgentPromptIdForTest(
  promptId: string,
  nextPromptId: string,
): Promise<{ id: string; created_at: Date }> {
  const { rows } = await write<{
    id: string
    created_at: Date
  }>(sql`/* updateAgentPromptIdForTest */
    UPDATE agent_prompts
    SET id = ${nextPromptId}
    WHERE id = ${promptId}
    RETURNING id, created_at
  `)
  return rows[0]!
}

export async function getRssFeedImportFollowForTest(importId: string): Promise<boolean> {
  const { rows } = await read<{ follow: boolean }>(sql`/* getRssFeedImportFollowForTest */
    SELECT follow
    FROM user_rss_feed_import_batches
    WHERE id = ${importId}
    LIMIT 1
  `)
  return rows[0]!.follow
}

export async function getPublicBaseTableNamesForTest(): Promise<Set<string>> {
  const { rows } = await read<{ table_name: string }>(
    `/* getPublicBaseTableNamesForTest */
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'`,
  )
  return new Set(rows.map(row => row.table_name))
}

export async function getPostShareRecipientIdsForTest(params: {
  sharedByUserId: string
  postId: string
}): Promise<string[]> {
  const { rows } = await read<{
    recipient_user_id: string
  }>(sql`/* getPostShareRecipientIdsForTest */
    SELECT recipient_user_id
    FROM post_feed_shares
    WHERE shared_by_user_id = ${params.sharedByUserId}
      AND post_id = ${params.postId}
    ORDER BY recipient_user_id
  `)
  return rows.map(row => row.recipient_user_id)
}

export async function getPostShareRowsForTest(params: {
  sharedByUserId: string
  postId: string
}): Promise<Array<{ recipient_user_id: string; shared_at: Date; sort_at: Date }>> {
  const { rows } = await read<{
    recipient_user_id: string
    shared_at: Date
    sort_at: Date
  }>(sql`/* getPostShareRowsForTest */
    SELECT
      recipient_user_id,
      created_at AS shared_at,
      sort_at
    FROM post_feed_shares
    WHERE shared_by_user_id = ${params.sharedByUserId}
      AND post_id = ${params.postId}
    ORDER BY recipient_user_id
  `)
  return rows
}

export async function getRssFeedItemShareRecipientIdsForTest(params: {
  sharedByUserId: string
  rssFeedItemId: string
}): Promise<string[]> {
  const { rows } = await read<{ recipient_user_id: string }>(
    sql`/* getRssFeedItemShareRecipientIdsForTest */
      SELECT recipient_user_id
      FROM rss_feed_item_feed_shares
      WHERE shared_by_user_id = ${params.sharedByUserId}
        AND rss_feed_item_id = ${params.rssFeedItemId}
      ORDER BY recipient_user_id
    `,
  )
  return rows.map(row => row.recipient_user_id)
}

export async function getManualSendNotificationRowsForTest(params: {
  sentByUserId: string
  postId?: string
  rssFeedItemId?: string
}): Promise<Array<{ user_id: string; title: string }>> {
  const query = sql`/* getManualSendNotificationRowsForTest */
    SELECT user_id, title
    FROM notifications
    WHERE sent_by_user_id = ${params.sentByUserId}
      AND delivery_type = 'manual_send'
  `
  if (params.postId) query.append(sql` AND post_id = ${params.postId}`)
  if (params.rssFeedItemId) query.append(sql` AND rss_feed_item_id = ${params.rssFeedItemId}`)
  query.append(sql` ORDER BY user_id`)
  const { rows } = await read<{ user_id: string; title: string }>(query)
  return rows
}

export async function softDeleteRssFeedItemsForTest(itemIds: string[]): Promise<void> {
  await write(sql`/* softDeleteRssFeedItemsForTest */
    UPDATE rss_feed_items
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${itemIds}::uuid[])
  `)
}

export async function restoreRssFeedItemsForTest(itemIds: string[]): Promise<void> {
  await write(sql`/* restoreRssFeedItemsForTest */
    UPDATE rss_feed_items
    SET deleted_at = NULL
    WHERE id = ANY(${itemIds}::uuid[])
  `)
}

export async function getFollowerDistributionFailureReasonsForTest(
  distributionIds: string[],
): Promise<string[]> {
  const { rows } = await read<{ failure_reason: string | null }>(
    sql`/* getFollowerDistributionFailureReasonsForTest */
      SELECT failure_reason
      FROM follower_distributions
      WHERE id = ANY(${distributionIds}::uuid[])
      ORDER BY id
    `,
  )
  return rows.map(row => row.failure_reason ?? '')
}

export async function countFollowerDistributionsForSenderForTest(
  senderUserId: string,
): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* countFollowerDistributionsForSenderForTest */
    SELECT COUNT(*) AS count
    FROM follower_distributions
    WHERE sender_user_id = ${senderUserId}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function getFollowerDistributionFailureForTest(
  distributionId: string,
): Promise<{ failed: boolean; failure_reason: string | null } | undefined> {
  const { rows } = await read<{ failed: boolean; failure_reason: string | null }>(
    sql`/* getFollowerDistributionFailureForTest */
      SELECT failed_at IS NOT NULL AS failed, failure_reason
      FROM follower_distributions
      WHERE id = ${distributionId}
    `,
  )
  return rows[0]
}

export async function setPostDeletedForTest(postId: string): Promise<void> {
  await write(sql`/* setPostDeletedForTest */
    UPDATE posts
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${postId}
  `)
}

export async function setPostBroadcastForTest(
  postId: string,
  broadcast: 'everyone' | 'users' | 'followers' | 'mutual_followers',
): Promise<void> {
  await write(sql`/* setPostBroadcastForTest */
    UPDATE posts
    SET broadcast = ${broadcast}
    WHERE id = ${postId}
  `)
}

export async function markFollowerDistributionFailedForTest(distributionId: string): Promise<void> {
  await write(sql`/* markFollowerDistributionFailedForTest */
    UPDATE follower_distributions
    SET failed_at = CURRENT_TIMESTAMP,
      completed_at = NULL
    WHERE id = ${distributionId}
  `)
}

export async function markUserFollowDeletedBeforeNowForTest(params: {
  followerId: string
  followingId: string
}): Promise<void> {
  await write(sql`/* markUserFollowDeletedBeforeNowForTest */
    UPDATE relation__user__follow__user
    SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 hour',
      deleted_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
      deleted_by_id = ${params.followerId}
    WHERE subject_id = ${params.followerId}
      AND object_id = ${params.followingId}
  `)
}

export async function setMarkdownPostVotesForTest(params: {
  postId: string
  countUp: number
  scoreUp?: number
}): Promise<void> {
  await write(sql`/* setMarkdownPostVotesForTest */
    UPDATE posts
    SET votes_score_up = ${params.scoreUp ?? params.countUp},
      votes_count_up = ${params.countUp},
      votes_count_down = 0
    WHERE id = ${params.postId}
  `)
}

export async function setPostAiSummaryMarkdownForTest(params: {
  postId: string
  aiSummaryMarkdown: string
}): Promise<void> {
  await write(sql`/* setPostAiSummaryMarkdownForTest */
    UPDATE posts
    SET ai_summary_markdown = ${params.aiSummaryMarkdown}
    WHERE id = ${params.postId}
  `)
}

export async function setPostVotesCountForTest(params: {
  postId: string
  up: number
  down: number
}): Promise<void> {
  await write(sql`/* setPostVotesCountForTest */
    UPDATE posts
    SET votes_count_up = ${params.up},
      votes_count_down = ${params.down}
    WHERE id = ${params.postId}
  `)
}

export async function setCommunityLanguageDetectionFieldsForTest(
  communityId: string,
): Promise<void> {
  await write(sql`/* setCommunityLanguageDetectionFieldsForTest */
    UPDATE communities
    SET
      lingua_rs_detected_language = 'fr',
      lingua_rs_content_sha256 = ${Buffer.alloc(32, 1)},
      lingua_rs_input_sha256 = ${Buffer.alloc(32, 2)},
      lingua_rs_results = ${JSON.stringify({ detector: 'test' })},
      lingua_rs_detected_at = NOW()
    WHERE id = ${communityId}
  `)
}

export async function markModerationReportReviewedForTest(params: {
  reportId: string
  resolvedById: string
}): Promise<void> {
  await write(sql`/* markModerationReportReviewedForTest */
    UPDATE moderation_reports
    SET reviewed_at = CURRENT_TIMESTAMP,
      resolution_action = 'reviewed',
      resolved_by_id = ${params.resolvedById}
    WHERE id = ${params.reportId}
  `)
}

export async function setPostModerationFlaggedForTest(params: {
  postId: string
  flagged: boolean
}): Promise<void> {
  await write(sql`/* setPostModerationFlaggedForTest */
    UPDATE posts
    SET openai_omni_moderation_flagged = ${params.flagged}
    WHERE id = ${params.postId}
  `)
}

export async function countPostReviewTopicRatingsForTest(postId: string): Promise<number> {
  const { rows } = await read<{ total: number }>(sql`/* countPostReviewTopicRatingsForTest */
    SELECT COUNT(*)::int AS total
    FROM post_review_topic_ratings
    WHERE post_id = ${postId}
  `)
  return rows[0]?.total ?? 0
}

export async function getPostUpdatedAtForTest(postId: string): Promise<Date> {
  const { rows } = await read<{ updated_at: Date }>(sql`/* getPostUpdatedAtForTest */
    SELECT updated_at
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0]!.updated_at
}

export async function setRssFeedDeclaredLanguageForTest(
  feedId: string,
  declaredLanguage: string | null,
): Promise<void> {
  await write(sql`/* setRssFeedDeclaredLanguageForTest */
    UPDATE rss_feeds
    SET declared_language = ${declaredLanguage}
    WHERE id = ${feedId}
  `)
}

export async function getRssFeedDeclaredLanguageForTest(feedId: string): Promise<string | null> {
  const { rows } = await read<{ declared_language: string | null }>(
    sql`/* getRssFeedDeclaredLanguageForTest */
      SELECT declared_language
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.declared_language ?? null
}

export async function getRssFeedTypeForTest(feedId: string): Promise<string | null> {
  const { rows } = await read<{ feed_type: string }>(
    sql`/* getRssFeedTypeForTest */
      SELECT feed_type
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.feed_type ?? null
}

export async function getRssFeedIgnoreRobotsTxtForTest(feedId: string): Promise<boolean | null> {
  const { rows } = await read<{ ignore_robots_txt: boolean | null }>(
    sql`/* getRssFeedIgnoreRobotsTxtForTest */
      SELECT ignore_robots_txt
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.ignore_robots_txt ?? null
}

export async function getRssFeedUnreliableStatusCodesForTest(
  feedId: string,
): Promise<number[] | null> {
  const { rows } = await read<{ unreliable_status_codes: number[] | null }>(
    sql`/* getRssFeedUnreliableStatusCodesForTest */
      SELECT unreliable_status_codes
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.unreliable_status_codes ?? null
}

export async function countEnabledRssFeedsForTest(): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countEnabledRssFeedsForTest */
    SELECT COUNT(*)::INT AS count
    FROM rss_feeds
    WHERE is_enabled = TRUE AND deleted_at IS NULL`,
    [],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function getRssFeedItemTitleByGuidForTest(guid: string): Promise<string | undefined> {
  const { rows } = await read<{
    data: { title: string }
  }>(sql`/* getRssFeedItemTitleByGuidForTest */
    SELECT items.data
    FROM rss_feed_item_ids ids
    JOIN rss_feed_items items ON items.id = ids.id
    WHERE ids.guid = ${guid}
    LIMIT 1
  `)
  return rows[0]?.data.title
}

export async function getWebRiskHostnameAuditForTest(hostname: string): Promise<
  | {
      blocked_source: string | null
      web_risk_checked_url: string | null
      web_risk_threat_types: string[] | null
      web_risk_expire_at: Date | null
    }
  | undefined
> {
  const { rows } = await read<{
    blocked_source: string | null
    web_risk_checked_url: string | null
    web_risk_threat_types: string[] | null
    web_risk_expire_at: Date | null
  }>(
    `/* getWebRiskHostnameAuditForTest */
    SELECT uhb.blocked_source, uh.web_risk_checked_url, uh.web_risk_threat_types, uh.web_risk_expire_at
    FROM url_hostnames uh
    LEFT JOIN LATERAL (
      SELECT blocked_source
      FROM url_hostname_blocks
      WHERE url_hostname_id = uh.id
        AND lifted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    ) uhb ON true
    WHERE uh.hostname = $1`,
    [hostname],
  )
  return rows[0]
}

export async function urlExistsForTest(url: string): Promise<boolean> {
  const { rows } = await read<{ id: string }>(
    `/* urlExistsForTest */
    SELECT id FROM urls WHERE url = $1`,
    [url],
  )
  return rows.length > 0
}

export async function insertReferralProgramValidationRuleWithExamplesForTest(params: {
  validationId: string
  hostname: string
  pathname: string
  isReferralLinkUrl: boolean
  isInvalidReferralLinkUrl?: boolean
  userErrorText?: string
  exampleUrls: string[]
}): Promise<void> {
  await write(sql`/* insertReferralProgramValidationRuleWithExamplesForTest */
    INSERT INTO referral_program_link_validations_rules (
      referral_program_link_validation_id,
      hostname,
      pathname,
      is_referral_link_url,
      is_invalid_referral_link_url,
      user_error_text,
      example_urls
    )
    VALUES (
      ${params.validationId},
      ${params.hostname},
      ${params.pathname},
      ${params.isReferralLinkUrl},
      ${params.isInvalidReferralLinkUrl ?? false},
      ${params.userErrorText ?? null},
      ${params.exampleUrls}
    )
  `)
}

export async function insertTopicAliasForTest(topicId: string, alias: string): Promise<void> {
  await write(sql`/* insertTopicAliasForTest */
    INSERT INTO topic_aliases (topic_id, alias)
    VALUES (${topicId}, ${alias})
  `)
}

export async function insertUnlinkedTopicAliasForTest(alias: string): Promise<void> {
  await write(sql`/* insertUnlinkedTopicAliasForTest */
    INSERT INTO topic_aliases (alias) VALUES (${alias})
  `)
}

export async function getTopicAliasIdForTest(alias: string): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`/* getTopicAliasIdForTest */
    SELECT id FROM topic_aliases WHERE alias = ${alias}
  `)
  return rows[0]?.id ?? null
}

export async function deletePostSlugForTest(postId: string, slug: string): Promise<void> {
  await write(sql`/* deletePostSlugForTest */
    DELETE FROM post_slugs
    WHERE post_id = ${postId}
      AND slug = ${slug}
  `)
}

export async function updateTopicSlugForTest(topicId: string, slug: string): Promise<void> {
  await write(sql`/* updateTopicSlugForTest */
    UPDATE topics
    SET slug = ${slug}
    WHERE id = ${topicId}
  `)
}

export async function markTopicRecommendationReviewedForTest(params: {
  postId: string
  reviewedById: string
  rejectionReason: string
}): Promise<void> {
  await write(sql`/* markTopicRecommendationReviewedForTest */
    UPDATE post_topic_recommendations
    SET reviewed_at = NOW(),
      reviewed_by_id = ${params.reviewedById},
      rejection_reason = ${params.rejectionReason},
      created_topic_id = NULL
    WHERE post_id = ${params.postId}
  `)
}

type LanguageDetectionEntityTable =
  | 'posts'
  | 'communities'
  | 'crawls'
  | 'users'
  | 'topics'
  | 'rss_feed_items'

export type LanguageDetectionStateForTest = {
  lingua_rs_detected_language: string | null
  lingua_rs_input_sha256: Buffer | null
  lingua_rs_detected_at: Date | null
}

export async function getLanguageDetectionStateForTest(
  table: LanguageDetectionEntityTable,
  id: string,
): Promise<LanguageDetectionStateForTest> {
  const query = sql`/* getLanguageDetectionStateForTest */
    SELECT lingua_rs_detected_language, lingua_rs_input_sha256, lingua_rs_detected_at
    FROM `
  query.append(sqlTableForLanguageDetection(table))
  query.append(sql` WHERE id = ${id}`)
  const { rows } = await read<LanguageDetectionStateForTest>(query)
  return rows[0]!
}

export async function insertLanguageDetectionPostForTest(params: {
  createdById: string
  title: string
  markdown: string
  declaredLanguage?: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionPostForTest */
    INSERT INTO posts (
      post_type, title, markdown, declared_language, created_by_id, broadcast, privacy, is_anonymous,
      bedrock_nova_multimodal_v1_content_sha256,
      openai_omni_moderation_content_sha256,
      llm_moderation_content_sha256,
      lingua_rs_input_sha256,
      deleted_at
    ) VALUES (
      'discussion',
      ${params.title},
      ${params.markdown},
      ${params.declaredLanguage ?? null},
      ${params.createdById},
      'everyone', 'public', false,
      ${`\\x${'0'.repeat(64)}`},
      ${`\\x${'0'.repeat(64)}`},
      ${`\\x${'0'.repeat(64)}`},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionCommunityForTest(params: {
  createdById: string
  name: string
  slug: string
  defaultLanguage?: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionCommunityForTest */
    INSERT INTO communities (
      name, slug, visibility, member_roster_visibility, created_by_id, default_language,
      lingua_rs_input_sha256, deleted_at
    )
    VALUES (
      ${params.name},
      ${params.slug},
      'public',
      'public',
      ${params.createdById},
      ${params.defaultLanguage ?? null},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionUserForTest(params: {
  username: string
  markdown?: string
  inputSha256?: Buffer
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionUserForTest */
    INSERT INTO users (username, markdown, lingua_rs_input_sha256)
    VALUES (${params.username}, ${params.markdown ?? ''}, ${params.inputSha256 ?? null})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function updateUserMarkdownForLanguageDetectionForTest(
  userId: string,
  markdown: string,
): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* updateUserMarkdownForLanguageDetectionForTest */
    UPDATE users SET markdown = ${markdown}
    WHERE id = ${userId}
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionTopicForTest(params: {
  createdById: string
  name: string
  slug: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionTopicForTest */
    INSERT INTO topics (
      name, slug, created_by_id, topic_type, noindex, allow_reviews,
      bedrock_nova_multimodal_v1_content_sha256, lingua_rs_input_sha256, deleted_at
    )
    VALUES (
      ${params.name},
      ${params.slug},
      ${params.createdById},
      'topic',
      false,
      true,
      ${`\\x${'0'.repeat(64)}`},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  const topicId = rows[0]!.id
  await write(sql`/* insertLanguageDetectionTopicMetricsForTest */
    INSERT INTO topic_metrics (topic_id) VALUES (${topicId}) ON CONFLICT DO NOTHING
  `)
  return topicId
}

export async function insertLanguageDetectionCrawlForTest(params: {
  hostname: string
  url: string
  markdown: string
  title?: string
  lang?: string
  inputSha256?: Buffer
}): Promise<string> {
  const hostnameResult = await write<{
    id: string
  }>(sql`/* insertLanguageDetectionCrawlHostnameForTest */
    INSERT INTO url_hostnames (hostname)
    VALUES (${params.hostname})
    ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
    RETURNING id
  `)
  const hostnameId = hostnameResult.rows[0]!.id
  const urlResult = await write<{ id: string }>(sql`/* insertLanguageDetectionCrawlUrlForTest */
    INSERT INTO urls (url, hostname_id, pathname, search_params)
    VALUES (${params.url}, ${hostnameId}, ${'/page'}, ${'{}'}::jsonb)
    RETURNING id
  `)
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionCrawlForTest */
    INSERT INTO crawls (
      url_id, response_status_code, title, lang, markdown, completed_at, embeddings_generated_at,
      network_error, lingua_rs_input_sha256
    )
    VALUES (
      ${urlResult.rows[0]!.id},
      200,
      ${params.title ?? null},
      ${params.lang ?? null},
      ${params.markdown},
      NOW(),
      NOW(),
      NULL,
      ${params.inputSha256 ?? null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function setRssFeedItemLanguageInputShaForTest(
  itemId: string,
  inputSha256: Buffer,
): Promise<void> {
  await write(sql`/* setRssFeedItemLanguageInputShaForTest */
    UPDATE rss_feed_items
    SET lingua_rs_input_sha256 = ${inputSha256}
    WHERE id = ${itemId}
  `)
}

export async function setUrlHostnameAttemptThresholdHoursForTest(
  hostnameId: string,
  attemptThresholdHours: number,
): Promise<void> {
  await write(sql`/* setUrlHostnameAttemptThresholdHoursForTest */
    UPDATE url_hostnames
    SET attempt_threshold_hours = ${attemptThresholdHours}
    WHERE id = ${hostnameId}
  `)
}

export async function getUrlHostnameUnreliableStatusCodesForTest(
  hostnameId: string,
): Promise<number[] | null> {
  const { rows } = await read<{ unreliable_status_codes: number[] | null }>(
    sql`/* getUrlHostnameUnreliableStatusCodesForTest */
      SELECT unreliable_status_codes
      FROM url_hostnames
      WHERE id = ${hostnameId}
    `,
  )
  return rows[0]?.unreliable_status_codes ?? null
}

function sqlTableForLanguageDetection(table: LanguageDetectionEntityTable): SQLStatement {
  switch (table) {
    case 'posts':
      return sql`posts`
    case 'communities':
      return sql`communities`
    case 'crawls':
      return sql`crawls`
    case 'users':
      return sql`users`
    case 'topics':
      return sql`topics`
    case 'rss_feed_items':
      return sql`rss_feed_items`
  }
}

export function createCommentAncestorInputSqlForTest(): SQLStatement {
  return sql`'123e4567-e89b-12d3-a456-426614174000'::uuid`
}

export function createUniversalTopicFiltersBaseQueryForTest(): SQLStatement {
  return sql`SELECT 1 FROM posts p WHERE TRUE`
}

export function createRssFeedItemHashtagFiltersBaseQueryForTest(): SQLStatement {
  return sql`SELECT 1 FROM rss_feed_items WHERE TRUE`
}

export function createEligibleRssFeedItemsCteBaseQueryForTest(): SQLStatement {
  return sql`WITH excluded_rss_feeds AS (SELECT NULL::uuid AS rss_feed_id WHERE FALSE),
    excluded_topics AS (SELECT NULL::uuid AS topic_id WHERE FALSE),
    excluded_hostname_ids AS (SELECT NULL::uuid AS hostname_id WHERE FALSE),
    hidden_items AS (SELECT NULL::uuid AS rss_feed_item_id WHERE FALSE)`
}

export function createEligiblePostsCteBaseQueryForTest(): SQLStatement {
  return sql`WITH excluded_users AS (SELECT NULL::uuid AS user_id WHERE FALSE),
    excluded_topics AS (SELECT NULL::uuid AS topic_id WHERE FALSE),
    excluded_hostname_ids AS (SELECT NULL::uuid AS hostname_id WHERE FALSE),
    hidden_posts AS (SELECT NULL::uuid AS post_id WHERE FALSE)`
}

export function createCrawlChunksBaseQueryForTest(): SQLStatement {
  return sql`SELECT * FROM crawl_chunks`
}

export function createCrawlChunksMarkdownConditionForTest(): SQLStatement {
  return sql` AND crawl_chunks.markdown IS NOT NULL`
}

export function createCrawlChunksCreatedAtOrderForTest(): SQLStatement {
  return sql` ORDER BY crawl_chunks.created_at DESC`
}

export async function getModeratorActionRowsForTest(params: {
  actorId?: string
  communityId?: string
  postId?: string
  targetUserId?: string
}): Promise<
  Array<{
    id: string
    community_id: string | null
    actor_id: string | null
    action_type: string
    post_id: string | null
    target_user_id: string | null
    report_id: string | null
    review_dispute_id: string | null
    community_application_id: string | null
    reason: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>
> {
  const query = sql`/* getModeratorActionRowsForTest */
    SELECT id, community_id, actor_id, action_type, post_id, target_user_id,
           report_id, review_dispute_id, community_application_id, reason, metadata, created_at
    FROM moderator_actions
    WHERE TRUE
  `
  if (params.actorId !== undefined) {
    query.append(sql` AND actor_id = ${params.actorId}`)
  }
  if (params.communityId !== undefined) {
    query.append(sql` AND community_id = ${params.communityId}`)
  }
  if (params.postId !== undefined) {
    query.append(sql` AND post_id = ${params.postId}`)
  }
  if (params.targetUserId !== undefined) {
    query.append(sql` AND target_user_id = ${params.targetUserId}`)
  }
  query.append(sql` ORDER BY id DESC`)
  const { rows } = await read<{
    id: string
    community_id: string | null
    actor_id: string | null
    action_type: string
    post_id: string | null
    target_user_id: string | null
    report_id: string | null
    review_dispute_id: string | null
    community_application_id: string | null
    reason: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>(query)
  return rows
}
