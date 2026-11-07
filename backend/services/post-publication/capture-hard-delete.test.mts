import { write } from '@data-stores/psql'
import { beginTransaction, createTestPost, createTestUser } from '@voucha/test-helpers'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import {
  retainUserCascadeHardDeletedPosts,
  USER_CASCADE_CAPTURE_MAX_POSTS,
} from './capture-hard-delete.mts'

describe('retainUserCascadeHardDeletedPosts', () => {
  it('captures a user with surviving posts within the cap', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    await createTestPost({ user })

    await using transaction = await beginTransaction()
    await expect(retainUserCascadeHardDeletedPosts(transaction, user.id)).resolves.toBeUndefined()
  })

  it('fails instead of capturing more than the cap of posts that survived the author drain', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    await write(sql`/* capture-hard-delete.test:seed */
      INSERT INTO posts (id, created_via, post_type, markdown, created_by_id, broadcast, privacy,
        is_anonymous, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
      SELECT uuidv7(), 'system', 'discussion', 'post ' || seed.n, ${user.id}, 'everyone', 'public',
        false, decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
      FROM generate_series(1, ${USER_CASCADE_CAPTURE_MAX_POSTS + 1}) AS seed(n)`)

    await using transaction = await beginTransaction()
    await expect(retainUserCascadeHardDeletedPosts(transaction, user.id)).rejects.toThrow(
      `more than ${USER_CASCADE_CAPTURE_MAX_POSTS} posts`,
    )
  })
})
