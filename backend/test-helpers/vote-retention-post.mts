import { randomUUID } from 'node:crypto'
import { createTestUserDirect } from './entities/users.mts'
import { insertTestPost } from './entities/posts.mts'

export async function createTestVoteRetentionPost() {
  const user = await createTestUserDirect()
  if (!user) throw new Error('Failed to create test user')
  const postId = await insertTestPost({
    createdById: user.id,
    title: 'Ballot retention test',
    slug: `ballot-retention-${randomUUID()}`,
    markdown: 'test',
  })
  return { userId: user.id, postId }
}
