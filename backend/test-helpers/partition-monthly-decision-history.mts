import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestPostClearanceChild(postId: string): Promise<string> {
  const { rows } = await read<{ partition: string }>(sql`
    /* readTestPostClearanceChild */
    SELECT tableoid::regclass::text AS partition
    FROM post_clearance_changes
    WHERE post_id = ${postId}::uuid
    ORDER BY id DESC LIMIT 1
  `)
  if (!rows[0]) throw new Error('Expected a post clearance change')
  return rows[0].partition
}

export async function readTestCommunityReviewChild(postId: string): Promise<string> {
  const { rows } = await read<{ partition: string }>(sql`
    /* readTestCommunityReviewChild */
    SELECT tableoid::regclass::text AS partition
    FROM community_post_review_changes
    WHERE post_id = ${postId}::uuid
    ORDER BY id DESC LIMIT 1
  `)
  if (!rows[0]) throw new Error('Expected a community review change')
  return rows[0].partition
}
