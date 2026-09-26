import { it, expect, describe } from 'vitest'
import { getPostsByAnyBatch } from './get-batch.mts'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createPost } from './create.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-batch', () => {
  it('getPostsByAnyBatch returns empty array for empty input', async () => {
    const results = await getPostsByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getPostsByAnyBatch fetches multiple posts by IDs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const post1 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post 1',
      markdown: 'Content 1',
    })
    const post2 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post 2',
      markdown: 'Content 2',
    })
    const post3 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post 3',
      markdown: 'Content 3',
    })
    // Fetch in specific order
    const results = await getPostsByAnyBatch([post2.id, post1.id, post3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(post2.id)
    expect(results[1]?.id).toBe(post1.id)
    expect(results[2]?.id).toBe(post3.id)
  })

  it('getPostsByAnyBatch fetches multiple posts by slugs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `test-slug-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `test-slug-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug3 = `test-slug-3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const post1 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post Slug 1',
      markdown: 'Content 1',
      slug: slug1,
    })
    const post2 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post Slug 2',
      markdown: 'Content 2',
      slug: slug2,
    })
    const post3 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post Slug 3',
      markdown: 'Content 3',
      slug: slug3,
    })
    // Fetch by slugs in specific order
    const results = await getPostsByAnyBatch([slug2, slug1, slug3])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(post2.id)
    expect(results[1]?.id).toBe(post1.id)
    expect(results[2]?.id).toBe(post3.id)
  })

  it('getPostsByAnyBatch handles mixed IDs and slugs', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug = `test-mixed-slug-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const post1 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post ID',
      markdown: 'Content',
    })
    const post2 = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post Slug',
      markdown: 'Content',
      slug,
    })
    // Mix IDs and slugs
    const results = await getPostsByAnyBatch([post1.id, slug])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(post1.id)
    expect(results[1]?.id).toBe(post2.id)
  })

  it('getPostsByAnyBatch returns null for non-existent posts while preserving order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const post = await createPost(WEB_PROVENANCE, user, {
      post_type: 'discussion',
      title: 'Test Post',
      markdown: 'Content',
    })
    const results = await getPostsByAnyBatch([
      '00000000-0000-0000-0000-000000000001',
      post.id,
      'nonexistent-slug',
    ])

    expect(results).toHaveLength(3)
    expect(results[0]).toBeNull()
    expect(results[1]?.id).toBe(post.id)
    expect(results[2]).toBeNull()
  })

  it('getPostsByAnyBatch throws for invalid identifiers', async () => {
    await expect(getPostsByAnyBatch(['invalid!@#'])).rejects.toThrow('Invalid post identifier')
  })
})
