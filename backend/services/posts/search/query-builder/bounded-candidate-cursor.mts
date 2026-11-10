import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'

export function appendCandidateCursor(
  query: SQLStatement,
  options: PostSearchOptions,
  sort: PostSearchSort,
): void {
  if (sort === 'relevance' && options.cohort_hi && options.cohort_lo) {
    query.append(sql` AND posts.id <= ${options.cohort_hi} AND posts.id >= ${options.cohort_lo}`)
  } else if (sort === 'relevance' && options.cohort_before_id) {
    query.append(sql` AND posts.id < ${options.cohort_before_id}`)
  } else if (
    (sort === 'new' || sort === 'following_new' || sort === 'relevance') &&
    options.id_lt
  ) {
    query.append(sql` AND posts.id < ${options.id_lt}`)
  }
  if (sort === 'best' && options.vote_score_lt !== undefined && options.id_lt) {
    query.append(
      sql` AND (posts.votes_score_sort, posts.id) < (${options.vote_score_lt}, ${options.id_lt})`,
    )
  }
  if (
    (sort === 'hot' || sort === 'trending') &&
    options.hot_score_lt !== undefined &&
    options.id_lt
  ) {
    query
      // The implied scalar bound helps the planner choose the ordered rank index before LIMIT;
      // the tuple still preserves the exact ID boundary for equal ranks.
      .append(sql` AND `)
      .append(buildStablePostHotRankExpression())
      .append(sql` <= ${options.hot_score_lt} AND (`)
      .append(buildStablePostHotRankExpression())
      .append(sql`, posts.id) < (${options.hot_score_lt}, ${options.id_lt})`)
  }
}

export function candidateOrder(sort: PostSearchSort): SQLStatement {
  if (sort === 'new' || sort === 'relevance' || sort === 'following_new') return sql`id DESC`
  if (sort === 'best') return sql`votes_score_sort DESC, id DESC`
  return sql`stable_hot_rank DESC, id DESC`
}

export function candidateReverseOrder(sort: PostSearchSort): SQLStatement {
  if (sort === 'new' || sort === 'relevance' || sort === 'following_new') return sql`id ASC`
  if (sort === 'best') return sql`votes_score_sort ASC, id ASC`
  return sql`stable_hot_rank ASC, id ASC`
}
