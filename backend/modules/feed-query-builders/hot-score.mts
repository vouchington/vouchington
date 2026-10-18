import sql, { type SQLStatement } from 'sql-template-strings'

export const HOT_SORT_HALF_LIFE_SECONDS = 3.0 * 86400.0

const SAFE_SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildHotScoreExpression(postsAlias = 'posts', referenceDate?: Date): SQLStatement {
  if (!SAFE_SQL_ALIAS.test(postsAlias)) {
    throw new Error(`Unsafe SQL alias: ${postsAlias}`)
  }

  const idColumn = `${postsAlias}.id`
  const votesScoreColumn = `${postsAlias}.votes_score_net`
  const referenceTimeMs = referenceDate?.getTime()
  if (referenceTimeMs !== undefined && !Number.isSafeInteger(referenceTimeMs)) {
    throw new RangeError('Invalid hot-score reference date')
  }
  const now = referenceTimeMs === undefined ? sql`NOW()` : sql`${new Date(referenceTimeMs)}`
  return sql`(`
    .append(votesScoreColumn)
    .append(sql` * POWER(2.0, CASE
      WHEN uuid_extract_timestamp(`)
    .append(idColumn)
    .append(sql`) > `)
    .append(now)
    .append(sql` THEN 0.0
      ELSE -EXTRACT(EPOCH FROM (`)
    .append(now)
    .append(sql` - uuid_extract_timestamp(`)
    .append(idColumn).append(sql`))) / ${HOT_SORT_HALF_LIFE_SECONDS}
    END))::DOUBLE PRECISION`)
}
