import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { createPostSlug } from './slugs.mts'
import {
  beginTransaction,
  createTestUser,
  createRandomString,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

function rand(): string {
  return createRandomString(8)
}

describe('createPostSlug', () => {
  it('rejects a UUID-shaped slug with 422', async () => {
    const user = (await createTestUser()) as PrivateUser
    const postId = await insertTestPost({
      title: `Slug UUID ${rand()}`,
      slug: `init-${rand()}`,
      createdById: user.id,
      markdown: 'body',
    })

    await expect(
      (async () => {
        await using query = await beginTransaction()
        const result = await createPostSlug({ id: postId, title: 'Some Title' }, randomUUID(), {
          query,
        })
        await query.commit()
        return result
      })(),
    ).rejects.toMatchObject({ status: 422, message: 'Slug must not be a UUID' })
  })

  it('inserts a valid slug for a post', async () => {
    const user = (await createTestUser()) as PrivateUser
    const postId = await insertTestPost({
      title: `Slug Valid ${rand()}`,
      slug: `init2-${rand()}`,
      createdById: user.id,
      markdown: 'body',
    })
    const newSlug = `extra-${rand()}`

    await using query = await beginTransaction()
    await createPostSlug({ id: postId, title: 'Some Title' }, newSlug, { query })
    await query.commit()

    const { postSlugExists } = await import('./get.mts')
    expect(await postSlugExists(newSlug)).toBe(true)
  })

  it('rejects a duplicate slug with 409', async () => {
    const user = (await createTestUser()) as PrivateUser
    const dupSlug = `dup-${rand()}`
    const postId = await insertTestPost({
      title: `Slug Dup ${rand()}`,
      slug: dupSlug,
      createdById: user.id,
      markdown: 'body',
    })

    await expect(
      (async () => {
        await using query = await beginTransaction()
        const result = await createPostSlug({ id: postId, title: 'Some Title' }, dupSlug, { query })
        await query.commit()
        return result
      })(),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('requires a title when generating a slug', async () => {
    await expect(
      (async () => {
        await using query = await beginTransaction()
        const result = await createPostSlug(
          { id: '00000000-0000-0000-0000-000000000000', title: null },
          undefined,
          { query },
        )
        await query.commit()
        return result
      })(),
    ).rejects.toMatchObject({ status: 422, message: 'Title is required' })
  })
})
