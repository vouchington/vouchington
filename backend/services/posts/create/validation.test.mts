import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { validateCreatePostInput } from './validation.mts'

describe('validateCreatePostInput article and blog authorization', () => {
  let administrator: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    administrator = await createTestUser({ administrator: true })
    user = await createTestUser()
  })

  describe.each(['article', 'blog_post'] as const)('%s', post_type => {
    it('rejects non-admin creation before later validation', async () => {
      await expect(
        validateCreatePostInput(user, { post_type, markdown: 'content' }, null),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('allows administrators to validate creation', async () => {
      await expect(
        validateCreatePostInput(administrator, { post_type, markdown: 'content' }, null),
      ).resolves.toMatchObject({ postType: post_type })
    })
  })
})
