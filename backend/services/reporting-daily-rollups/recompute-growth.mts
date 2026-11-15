import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getReportingDayBounds } from './windows.mts'

/** Caller owns the same-day ordering lane and the transaction containing this replacement. */
export async function recomputeGrowthDay(day: string, query: TransactionQuery) {
  const { start, end, firstId, afterLastId } = getReportingDayBounds(day)
  const { rows } = await query<{ id: string }>(sql`/* recomputeGrowthDay */
    INSERT INTO growth_metric_daily_totals (
      day, user_count, post_count, review_count, data_point_count, discussion_count,
      comment_count, story_count, approved_count, reviewed_count, follow_count,
      vote_count, retained_vote_count
    )
    SELECT ${day}::date,
      (SELECT count(*) FROM users WHERE id >= ${firstId} AND id < ${afterLastId} AND deleted_at IS NULL),
      count(*), count(*) FILTER (WHERE post_type = 'review'),
      count(*) FILTER (WHERE post_type = 'data_point'), count(*) FILTER (WHERE post_type = 'discussion'),
      count(*) FILTER (WHERE post_type = 'comment'), count(*) FILTER (WHERE post_type = 'story'),
      count(*) FILTER (WHERE approved_at IS NOT NULL),
      count(*) FILTER (WHERE approved_at IS NOT NULL OR rejected_at IS NOT NULL),
      (SELECT count(*) FROM relation__user__follow__user
        WHERE created_at >= ${start} AND created_at < ${end} AND deleted_at IS NULL),
      (SELECT count(*)
        -- no-mistakes-disable-next-line postgres-required-predicates: counts votes cast in a time window, which span every target post_id partition.
        FROM post_votes WHERE id >= ${firstId} AND id < ${afterLastId}
        AND score IS NOT NULL AND NOT (score IN (-2, 2) AND NOT score_is_semantic)),
      COALESCE((SELECT count FROM post_vote_retained_daily_counts WHERE day = ${day}::date), 0)
    FROM posts WHERE id >= ${firstId} AND id < ${afterLastId} AND deleted_at IS NULL
    ON CONFLICT (day) DO UPDATE SET
      user_count = EXCLUDED.user_count, post_count = EXCLUDED.post_count,
      review_count = EXCLUDED.review_count, data_point_count = EXCLUDED.data_point_count,
      discussion_count = EXCLUDED.discussion_count, comment_count = EXCLUDED.comment_count,
      story_count = EXCLUDED.story_count, approved_count = EXCLUDED.approved_count,
      reviewed_count = EXCLUDED.reviewed_count, follow_count = EXCLUDED.follow_count,
      vote_count = EXCLUDED.vote_count, retained_vote_count = EXCLUDED.retained_vote_count
    RETURNING id
  `)
  await replaceDayAuthors(rows[0]!.id, firstId, afterLastId, query)
}

async function replaceDayAuthors(
  totalId: string,
  firstId: string,
  afterLastId: string,
  query: TransactionQuery,
) {
  await query(sql`/* replaceGrowthDayAuthors */
    DELETE FROM growth_metric_daily_post_authors WHERE growth_metric_daily_total_id = ${totalId}
  `)
  await query(sql`/* insertGrowthDayAuthors */
    INSERT INTO growth_metric_daily_post_authors(growth_metric_daily_total_id, author_user_id)
    SELECT ${totalId}::uuid, created_by_id FROM posts
    WHERE id >= ${firstId} AND id < ${afterLastId} AND deleted_at IS NULL
      AND created_by_id IS NOT NULL
    GROUP BY created_by_id
  `)
}
