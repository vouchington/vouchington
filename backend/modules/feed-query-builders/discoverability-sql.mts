import sql, { type SQLStatement } from 'sql-template-strings'

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export function feedIsEnabledAndDiscoverableSql(feedAlias: string): SQLStatement {
  if (!SAFE_SQL_IDENTIFIER.test(feedAlias)) {
    throw new Error(`Unsafe SQL alias: ${feedAlias}`)
  }

  return sql`EXISTS (
    SELECT 1
    FROM view_rss_feed_current_states current_state
    WHERE current_state.rss_feed_id = `.append(`${feedAlias}.id`).append(sql`
      AND current_state.is_enabled = TRUE
      AND current_state.is_discoverable = TRUE
  )`)
}

export function itemHasDiscoverableSourceSql(itemColumnSql: string): SQLStatement {
  const stmt = sql`EXISTS (
    SELECT 1
    FROM rss_feed_item_sources rfis
    JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
    JOIN view_rss_feed_current_states current_state
      ON current_state.rss_feed_id = rf.id
    WHERE rfis.rss_feed_item_id = `
  stmt.append(itemColumnSql)
  stmt.append(sql`
      AND rf.deleted_at IS NULL
      AND current_state.is_enabled = TRUE
      AND current_state.is_discoverable = TRUE
  )`)
  return stmt
}
