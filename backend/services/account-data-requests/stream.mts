import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Streams profile rows (one row) for the given user. */
export function streamProfile(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamProfile */
    SELECT
      id,
      username,
      use_display_name_from,
      markdown,
      cards_visibility,
      rewards_program_statuses_visibility,
      spending_categories_visibility,
      follows_visibility,
      topic_follows_visibility,
      rss_feed_follows_visibility,
      community_memberships_visibility,
      followers_visibility,
      likes_visibility,
      direct_messages_audience,
      default_post_broadcast,
      default_post_privacy,
      processing_restricted_at,
      third_party_marketing,
      hn_discussions,
      country,
      ui_locale,
      uuid_extract_timestamp(id) AS created_at,
      updated_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `)
}

/** Streams all non-deleted posts for the given user. */
export function streamPosts(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamPosts */
    SELECT
      id,
      post_type AS type,
      title,
      NULL::TEXT AS slug,
      markdown,
      NULL::TIMESTAMPTZ AS published_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at
    FROM posts
    WHERE created_by_id = ${userId}
      AND deleted_at IS NULL
    ORDER BY id ASC
  `)
}

/** Streams all votes for the given user. */
export function streamVotes(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamVotes */
    SELECT 'post' AS entity_type, pv.post_id AS entity_id,
      CASE WHEN pv.score IS NULL THEN 'clear'
        WHEN pv.score = 0 AND NOT pv.score_is_neutral THEN 'clear'
        WHEN p.post_type = 'topic_recommendation' AND pv.score = 1 THEN 'support'
        WHEN p.post_type = 'topic_recommendation' AND pv.score = -1 THEN 'oppose'
        WHEN p.post_type = 'topic_recommendation' THEN 'clear'
        WHEN pv.score = 2 THEN 'vouch' WHEN pv.score = 1 THEN CASE WHEN pv.score_is_semantic THEN 'like' ELSE 'vouch' END
        WHEN pv.score = 0 THEN 'neutral' WHEN pv.score = -1 THEN CASE WHEN pv.score_is_semantic THEN 'dislike' ELSE 'disavow' END ELSE 'disavow' END AS choice,
      pv.created_at
    FROM post_votes pv
    JOIN posts p ON p.id = pv.post_id
    WHERE pv.user_id = ${userId}
      AND (pv.score IN (-2, 2) AND NOT pv.score_is_semantic) IS NOT TRUE
    UNION ALL
    SELECT 'topic' AS entity_type, topic_id AS entity_id, CASE WHEN score IS NULL OR (score = 0 AND NOT score_is_neutral) THEN 'clear' WHEN score = 2 THEN 'vouch' WHEN score = 1 AND score_is_semantic THEN 'like' WHEN score = 1 THEN 'vouch' WHEN score = 0 THEN 'neutral' WHEN score = -1 AND score_is_semantic THEN 'dislike' WHEN score = -1 THEN 'disavow' ELSE 'disavow' END AS choice, created_at
    FROM topic_votes
    WHERE user_id = ${userId}
      AND (score IN (-2, 2) AND NOT score_is_semantic) IS NOT TRUE
    UNION ALL
    SELECT 'hostname' AS entity_type, hostname_id AS entity_id, CASE WHEN score IS NULL OR (score = 0 AND NOT score_is_neutral) THEN 'clear' WHEN score = 2 THEN 'vouch' WHEN score = 1 AND score_is_semantic THEN 'like' WHEN score = 1 THEN 'vouch' WHEN score = 0 THEN 'neutral' WHEN score = -1 AND score_is_semantic THEN 'dislike' WHEN score = -1 THEN 'disavow' ELSE 'disavow' END AS choice, created_at
    FROM hostname_votes
    WHERE user_id = ${userId}
      AND (score IN (-2, 2) AND NOT score_is_semantic) IS NOT TRUE
    UNION ALL
    SELECT 'rss_feed_item' AS entity_type, rss_feed_item_id AS entity_id, CASE WHEN score IS NULL OR (score = 0 AND NOT score_is_neutral) THEN 'clear' WHEN score = 2 THEN 'vouch' WHEN score = 1 AND score_is_semantic THEN 'like' WHEN score = 1 THEN 'vouch' WHEN score = 0 THEN 'neutral' WHEN score = -1 AND score_is_semantic THEN 'dislike' WHEN score = -1 THEN 'disavow' ELSE 'disavow' END AS choice, created_at
    FROM rss_feed_item_votes
    WHERE user_id = ${userId}
      AND (score IN (-2, 2) AND NOT score_is_semantic) IS NOT TRUE
    UNION ALL
    SELECT 'entity_relation' AS entity_type, entity_relation_id AS entity_id, CASE WHEN score IS NULL OR score = 0 THEN 'clear' WHEN score = 1 THEN 'confirm' ELSE 'dispute' END AS choice, created_at
    FROM entity_relation_votes WHERE user_id = ${userId}
    UNION ALL
    SELECT 'agent_moderation' AS entity_type, agent_moderation_id AS entity_id, CASE WHEN score IS NULL OR score = 0 THEN 'clear' WHEN score = 1 THEN 'accurate' ELSE 'inaccurate' END AS choice, created_at
    FROM agent_moderation_votes WHERE user_id = ${userId}
    UNION ALL
    SELECT 'user_vouch' AS entity_type, target_user_id AS entity_id, CASE WHEN score IS NULL OR (score = 0 AND NOT score_is_neutral) THEN 'clear' WHEN score = 2 THEN 'vouch' WHEN score = 1 AND score_is_semantic THEN 'like' WHEN score = 1 THEN 'vouch' WHEN score = 0 THEN 'neutral' WHEN score = -1 AND score_is_semantic THEN 'dislike' WHEN score = -1 THEN 'disavow' ELSE 'disavow' END AS choice, created_at
    FROM user_vouch_votes
    WHERE user_id = ${userId}
      AND (score IN (-2, 2) AND NOT score_is_semantic) IS NOT TRUE
    ORDER BY created_at ASC
  `)
}

/** Streams email address rows for the given user. */
export function streamEmails(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamEmails */
    SELECT
      email_address,
      is_primary,
      created_at
    FROM user_email_addresses
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `)
}

/** Streams phone number rows for the given user. */
export function streamPhones(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamPhones */
    SELECT
      phone_number,
      is_primary,
      created_at
    FROM user_phone_numbers
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `)
}

/** Streams passkey rows for the given user (metadata only, no credential bytes or public key). */
export function streamPasskeys(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamPasskeys */
    SELECT
      name,
      device_type,
      backed_up,
      uuid_extract_timestamp(id) AS created_at,
      last_used_at
    FROM user_passkeys
    WHERE user_id = ${userId}
    ORDER BY id ASC
  `)
}
