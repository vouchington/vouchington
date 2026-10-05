import type { TransactionQuery } from '@data-stores/psql'
import { approveSeedPosts, sha256 } from './helpers.mts'

// Fixtures for playwright/tests/agents/account-label-displays.spec.mts: one discussion, one
// comment and one share per account label. Comments and shares land on the member's discussion,
// and the viewer follows every author, so the viewer's following list and friends feed carry
// every label. The ids are mirrored in the spec.
const MEMBER_ID = '019d0000-0000-7000-8000-0000000001a1'
const VIEWER_ID = '019d0000-0000-7000-8000-0000000001a2'
const MEMBER_USERNAME = 'pw-label-member'
const MEMBER_POST_ID = seedId(1, 1)

function seedId(kind: 1 | 2 | 3, index: number): string {
  return `019c64e6-f760-700${kind}-a00${kind}-00000000000${index}`
}

async function lookupPlatformAuthors(
  query: TransactionQuery,
): Promise<Array<{ id: string; username: string }>> {
  const { rows } = await query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE (username IN ('test-reviewer', 'system') AND platform_account_kind = 'system') OR (username = 'jong' AND platform_account_kind = 'official') ORDER BY username`,
  )
  if (rows.length !== 3) {
    throw new Error(
      `Account label seed expected test-reviewer, system and jong; found ${rows.length}`,
    )
  }
  return rows
}

async function seedPlaywrightPostAccountLabels(query: TransactionQuery): Promise<void> {
  await query(
    `INSERT INTO users (id, username) VALUES ($1, $2), ($3, 'pw-label-viewer') ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
    [MEMBER_ID, MEMBER_USERNAME, VIEWER_ID],
  )
  const authors = [
    { id: MEMBER_ID, username: MEMBER_USERNAME },
    ...(await lookupPlatformAuthors(query)),
  ]
  const postIds: string[] = []
  for (const [offset, author] of authors.entries()) {
    const index = offset + 1
    const postHash = sha256(`account-label-post-${author.username}`).toString('hex')
    const commentHash = sha256(`account-label-comment-${author.username}`).toString('hex')
    await query(
      `INSERT INTO posts ( id, post_type, title, markdown, created_by_id, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, created_via ) VALUES ( $1, 'discussion', $2, $3, $4, decode($5, 'hex'), decode($5, 'hex'), 'system' ) ON CONFLICT (id) DO NOTHING`,
      [
        seedId(1, index),
        `Account label discussion by ${author.username}`,
        `A seeded discussion authored by ${author.username}.`,
        author.id,
        postHash,
      ],
    )
    await query(
      `INSERT INTO posts ( id, post_type, parent_post_id, root_post_id, created_by_id, markdown, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, created_via ) VALUES ( $1, 'comment', $2, $2, $3, $4, decode($5, 'hex'), decode($5, 'hex'), 'system' ) ON CONFLICT (id) DO NOTHING`,
      [
        seedId(2, index),
        MEMBER_POST_ID,
        author.id,
        `Account label comment by ${author.username}`,
        commentHash,
      ],
    )
    postIds.push(seedId(1, index), seedId(2, index))
    // The shared-posts query drops shares older than a week, so refresh sort_at on reused databases.
    await query(
      `INSERT INTO post_feed_shares (recipient_user_id, id, shared_by_id, post_id, sort_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT (recipient_user_id, id) DO UPDATE SET sort_at = EXCLUDED.sort_at`,
      [VIEWER_ID, seedId(3, index), author.id, MEMBER_POST_ID],
    )
  }
  await approveSeedPosts(query, postIds)
  await query(
    `INSERT INTO relation__user__follow__user (subject_id, object_id) SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
    [VIEWER_ID, authors.map(author => author.id)],
  )
}

export { seedPlaywrightPostAccountLabels }
