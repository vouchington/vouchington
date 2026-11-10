import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { deleteUser } from '@services/users/delete'
import { createPost } from '../create.mts'

describe('createPost deleted author lifecycle', () => {
  it('rejects creation after the author deletion commits', async () => {
    const author = await createTestUser()
    await deleteUser(author, author)

    await expect(
      createPost(author, WEB_PROVENANCE, {
        title: 'Creation blocked by a committed author deletion',
        markdown: 'This post must not be created after the author is deleted.',
        post_type: 'discussion',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Author is not active',
    })
  })
})
