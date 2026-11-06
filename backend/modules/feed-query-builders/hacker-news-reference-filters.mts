import sql, { type SQLStatement } from 'sql-template-strings'

/** The maintained flag includes direct and qualifying related URLs. */
export function buildPostHasHackerNewsReferences(): SQLStatement {
  return sql`posts.has_hacker_news_references`
}

/** RSS items and podcast episodes use the maintained URL reference flag. */
export function buildRssFeedItemHasHackerNewsReferences(): SQLStatement {
  return sql`rss_feed_items.has_hacker_news_references`
}
