import sql from 'sql-template-strings'

export const HTML_CRAWL_EXCLUSIVITY_SQL = sql`
      AND NOT EXISTS (
        SELECT 1 FROM rss_feeds rf WHERE rf.rss_feed_url_id = u.id AND rf.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_referral_program_links urpl
        WHERE urpl.url_id = u.id
          AND urpl.activated_at IS NOT NULL
          AND urpl.deactivated_at IS NULL
          AND urpl.deleted_at IS NULL
      )`
