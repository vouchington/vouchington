import { describe, it, expect } from 'vitest'
import { postSlugExists } from './get.mts'
import { createTestUser, createRandomString, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

function rand(): string {
  return createRandomString(8)
}

describe('postSlugExists', () => {
  it('returns true for an existing post slug', async () => {
    const user = (await createTestUser()) as PrivateUser
    const slug = `pse-${rand()}`
    await insertTestPost({
      title: `Slug Exists ${rand()}`,
      slug,
      createdById: user.id,
      markdown: 'body',
    })
    expect(await postSlugExists(slug)).toBe(true)
    // Case-insensitive: the lookup lowercases the input.
    expect(await postSlugExists(slug.toUpperCase())).toBe(true)
  })

  it('returns false for a nonexistent slug', async () => {
    expect(await postSlugExists(`nonexistent-${rand()}`)).toBe(false)
  })
})
