import sql, { type SQLStatement } from 'sql-template-strings'

/** Stable log rank. The epoch avoids exponent overflow and keeps the B-tree expression immutable. */
export function buildStablePostHotRankExpression(alias = 'posts'): SQLStatement {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Unsafe post alias')
  const score = `${alias}.votes_score_sort`
  const id = `${alias}.id`
  return sql`(CASE WHEN `
    .append(score)
    .append(sql` > 0 THEN LN(`)
    .append(score)
    .append(sql`::DOUBLE PRECISION) +
      EXTRACT(EPOCH FROM (uuid_extract_timestamp(`)
    .append(id).append(sql`) - TIMESTAMPTZ '2026-01-01 00:00:00+00'))
        / 259200.0 * LN(2.0)
      ELSE -1e300::DOUBLE PRECISION END)`)
}

export function stableHotCursorScope(sort: 'hot' | 'trending'): string {
  return sort === 'hot' ? 'post-hot-stable-2026' : 'post-trending-stable-2026'
}
