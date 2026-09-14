import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  insertLocalTestPost,
  queryLocalTestPostOpenAIModerationFlag,
  recordLocalTestPostOpenAIModerationDisposition,
} from '../../../../test-helpers/data-stores/psql/posts.mts'

describe('view_posts moderation projection', () => {
  let postId: string

  beforeAll(async () => {
    const user = await createLocalTestUser()
    postId = await insertLocalTestPost({
      title: `view-post-moderation-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'post moderation projection test',
    })
  })

  it('projects the latest OpenAI disposition for the current content version', async () => {
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBeNull()

    await recordLocalTestPostOpenAIModerationDisposition(postId, 'review')
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBe(true)

    await recordLocalTestPostOpenAIModerationDisposition(postId, 'pass')
    expect(await queryLocalTestPostOpenAIModerationFlag(postId)).toBe(false)
  })
})
