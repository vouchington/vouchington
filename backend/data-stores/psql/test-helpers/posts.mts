import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// This duplicates the minimum of test-helpers' insertTestPost that view-users.test.mts actually
// reads: view_posts.created_by/created_by_id. It skips options (urlId, community, embeddings, slug)
// that view-users.test.mts never sets. clearance is still approved explicitly even though
// view_posts does not filter on it today, to stay correct if that view ever adds a clearance
// filter.
export async function insertLocalTestPost(data: {
  title: string
  markdown: string
  createdById: string
}): Promise<string> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO posts (
      post_type, title, markdown, created_by_id,
      bedrock_nova_multimodal_v1_content_sha256,
      openai_omni_moderation_content_sha256,
      llm_moderation_content_sha256
    ) VALUES (
      'discussion', ${data.title}, ${data.markdown}, ${data.createdById},
      ${sha256}, ${sha256}, ${sha256}
    )
    RETURNING id
  `)
  const postId = rows[0]!.id

  await write(sql`
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      VALUES (${postId}, 'approve', ${data.createdById})
      RETURNING id, created_at
    )
    UPDATE posts
    SET latest_clearance_change_id = inserted_change.id,
      approved_at = inserted_change.created_at
    FROM inserted_change
    WHERE posts.id = ${postId}
  `)

  return postId
}
