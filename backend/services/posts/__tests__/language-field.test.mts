import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { createTestUser, getPostUpdatedAtForTest, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { assertValidPostUpdate } from '../update/validation.mts'
import type { Post } from '../types.mts'

describe('declared_language field — create and update', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  // ── create path ────────────────────────────────────────────────────────────

  it('createPost stores a valid declared language tag', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language field test — en',
      markdown: 'hello',
      post_type: 'discussion',
      declared_language: 'en',
    })
    expect(post.declared_language).toBe('en')
  })

  it('createPost normalizes BCP-47 region subtag to base language', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language field test — en-US',
      markdown: 'hello',
      post_type: 'discussion',
      declared_language: 'en-US',
    })
    expect(post.declared_language).toBe('en')
  })

  it('createPost stores null for an unsupported language code', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language field test — xx unsupported',
      markdown: 'hello',
      post_type: 'discussion',
      declared_language: 'xx',
    })
    expect(post.declared_language).toBeNull()
  })

  it('createPost rejects a non-string language with status 422', async () => {
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Language field test — non-string',
        markdown: 'hello',
        post_type: 'discussion',
        declared_language: 123 as unknown as string,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  // ── update path ────────────────────────────────────────────────────────────

  it('updatePost sets declared_language on an existing post', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language update test — set fr',
      markdown: 'hello',
      post_type: 'discussion',
    })
    const updated = await updatePost(user, post, { declared_language: 'fr' })
    expect(updated!.declared_language).toBe('fr')
  })

  it('updatePost clears declared_language when set to null', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language update test — clear',
      markdown: 'hello',
      post_type: 'discussion',
      declared_language: 'en',
    })
    const updated = await updatePost(user, post, { declared_language: null })
    expect(updated!.declared_language).toBeNull()
  })

  it('updatePost does not bump updated_at for an unchanged normalized declared_language', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Language update test — unchanged',
      markdown: 'hello',
      post_type: 'discussion',
      declared_language: 'en',
    })
    const before = await getPostUpdatedAtForTest(post.id)

    const updated = await updatePost(user, post, { declared_language: 'en-US' })

    const after = await getPostUpdatedAtForTest(post.id)
    expect(updated!.declared_language).toBe('en')
    expect(after.getTime()).toBe(before.getTime())
  })

  it('assertValidPostUpdate rejects a non-string declared_language with status 422', async () => {
    const fakePost = {
      id: 'fake-id',
      post_type: 'discussion',
      created_by_id: user.id,
      is_anonymous: false,
    } as unknown as Post
    await expect(
      assertValidPostUpdate(user, fakePost, { declared_language: 42 as unknown as string }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
