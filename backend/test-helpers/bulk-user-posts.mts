import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Inserts `count` plain discussion posts owned by `userId` in one statement. */
export async function insertBulkPostsForUserForTest(userId: string, count: number): Promise<void> {
  await write(sql`/* insertBulkPostsForUserForTest */
    INSERT INTO posts (id, created_via, post_type, markdown, created_by_id, broadcast, privacy,
      is_anonymous, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT uuidv7(), 'system', 'discussion', 'post ' || seed.n, ${userId}, 'everyone', 'public',
      false, decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
    FROM generate_series(1, ${count}) AS seed(n)`)
}
