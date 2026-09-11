import sql, { type SQLStatement } from 'sql-template-strings'

export const HOT_SORT_HALF_LIFE_SECONDS = 3.0 * 86400.0

const SAFE_SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildHotScoreExpression(postsAlias = 'posts'): SQLStatement {
  if (!SAFE_SQL_ALIAS.test(postsAlias)) {
    throw new Error(`Unsafe SQL alias: ${postsAlias}`)
  }

  const idColumn = `${postsAlias}.id`
  const votesScoreColumn = `${postsAlias}.votes_score_net`
  return sql`(`
    .append(votesScoreColumn)
    .append(sql` * POWER(2.0, CASE
      WHEN uuid_extract_timestamp(`)
    .append(idColumn)
    .append(sql`) > NOW() THEN 0.0
      ELSE -EXTRACT(EPOCH FROM (NOW() - uuid_extract_timestamp(`)
    .append(idColumn).append(sql`))) / ${HOT_SORT_HALF_LIFE_SECONDS}
    END))::DOUBLE PRECISION`)
}
