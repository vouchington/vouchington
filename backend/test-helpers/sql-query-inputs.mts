import sql, { type SQLStatement } from 'sql-template-strings'

export function createTestSqlStatement(): SQLStatement {
  return sql`SELECT 1 WHERE true`
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
