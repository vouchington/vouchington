import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { POST_CONTENT_EDIT_WINDOW_EXPIRED } from '@modules/on-error/error-codes'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { assertPostContentEditable, isPostContentEditable } from '../authorization.mts'
import { getPostByAny } from '../get.mts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

describe('post content edit window', () => {
  let creator: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    const [createdCreator, createdAdmin] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    const [loadedCreator, loadedAdmin] = await Promise.all([
      getPrivateUserByAny(createdCreator.id),
      getPrivateUserByAny(createdAdmin.id),
    ])
    if (!loadedCreator || !loadedAdmin) throw new Error('Expected persisted users')
    creator = loadedCreator
    admin = loadedAdmin
  })

  it.each([
    ['January to February', '2026-01-31T12:00:00.000Z'],
    ['leap February to March', '2028-02-29T23:59:59.000Z'],
  ])('admits the exact 24-hour edge across %s', async (_label, anchor) => {
    const createdAt = new Date(anchor)
    const postId = await insertTestPost({
      title: `Edit window ${randomUUID()}`,
      slug: `edit-window-${randomUUID()}`,
      markdown: 'Persisted content',
      createdById: creator.id,
      createdAt,
    })
    const post = await getPostByAny(postId)
    if (!post) throw new Error('Expected persisted post')
    expect(getDateFromUUIDv7(post.id)?.getTime()).toBe(createdAt.getTime())

    const edge = createdAt.getTime() + ONE_DAY_MS
    expect(isPostContentEditable(creator, post, edge - 1)).toBe(true)
    expect(() => assertPostContentEditable(creator, post, edge - 1)).not.toThrow()
    expect(isPostContentEditable(creator, post, edge)).toBe(true)
    expect(() => assertPostContentEditable(creator, post, edge)).not.toThrow()
    expect(isPostContentEditable(creator, post, edge + 1)).toBe(false)
    let rejection: unknown
    try {
      assertPostContentEditable(creator, post, edge + 1)
    } catch (err) {
      rejection = err
    }
    expect(rejection).toMatchObject({ status: 403, code: POST_CONTENT_EDIT_WINDOW_EXPIRED })

    expect(isPostContentEditable(admin, post, edge + 1)).toBe(true)
    expect(() => assertPostContentEditable(admin, post, edge + 1)).not.toThrow()
    const nonV7Post = { ...post, id: randomUUID() }
    expect(getDateFromUUIDv7(nonV7Post.id)).toBeNull()
    expect(isPostContentEditable(creator, nonV7Post, edge + 1)).toBe(true)
    expect(() => assertPostContentEditable(creator, nonV7Post, edge + 1)).not.toThrow()
  })
})
