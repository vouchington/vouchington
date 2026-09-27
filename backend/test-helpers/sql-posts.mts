import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function isTestPostgresQueryWaitingForLock(queryMarker: string): Promise<boolean> {
  const { rows } = await write<{ waiting: boolean }>(sql`/* isTestPostgresQueryWaitingForLock */
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
        AND query LIKE ${`%${queryMarker}%`}
    ) AS waiting`)
  return rows[0]?.waiting ?? false
}

export async function setPostDeletedForTest(postId: string): Promise<void> {
  await write(sql`/* setPostDeletedForTest */
    UPDATE posts
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${postId}
  `)
}

export async function setPostBroadcastForTest(
  postId: string,
  broadcast: 'everyone' | 'users' | 'followers' | 'mutual_followers',
): Promise<void> {
  await write(sql`/* setPostBroadcastForTest */
    UPDATE posts
    SET broadcast = ${broadcast}
    WHERE id = ${postId}
  `)
}

export async function setMarkdownPostVotesForTest(params: {
  postId: string
  countUp: number
  scoreUp?: number
}): Promise<void> {
  await write(sql`/* setMarkdownPostVotesForTest */
    UPDATE posts
    SET votes_score_up = ${params.scoreUp ?? params.countUp},
      votes_count_up = ${params.countUp},
      votes_count_down = 0
    WHERE id = ${params.postId}
  `)
}

export async function setPostAiSummaryMarkdownForTest(params: {
  postId: string
  aiSummaryMarkdown: string
}): Promise<void> {
  await write(sql`/* setPostAiSummaryMarkdownForTest */
    UPDATE posts
    SET ai_summary_markdown = ${params.aiSummaryMarkdown}
    WHERE id = ${params.postId}
  `)
}

export async function setPostVotesCountForTest(params: {
  postId: string
  up: number
  down: number
}): Promise<void> {
  await write(sql`/* setPostVotesCountForTest */
    UPDATE posts
    SET votes_count_up = ${params.up},
      votes_count_down = ${params.down}
    WHERE id = ${params.postId}
  `)
}

export async function getPostUpdatedAtForTest(postId: string): Promise<Date> {
  const { rows } = await read<{ updated_at: Date }>(sql`/* getPostUpdatedAtForTest */
    SELECT updated_at
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0]!.updated_at
}

export async function deletePostSlugForTest(postId: string, slug: string): Promise<void> {
  await write(sql`/* deletePostSlugForTest */
    DELETE FROM post_slugs
    WHERE post_id = ${postId}
      AND slug = ${slug}
  `)
}
