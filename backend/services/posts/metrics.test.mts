import { it, expect, describe, beforeAll } from 'vitest'
import { getPostMetricsByAny } from './metrics.mts'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('getPostMetricsByAny', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  const insertPost = async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `test-post-${random}`
    const id = await insertTestPost({
      title: `Test Post ${random}`,
      slug,
      createdById: user.id,
      markdown: 'Test content',
    })
    return { id, slug }
  }

  it('retrieves metrics by UUID', async () => {
    const { id } = await insertPost()
    const metrics = await getPostMetricsByAny(id)

    expect(metrics).toMatchObject({
      __entity_type: 'post_metrics',
      id,
      count: { descendants: 0, children: 0 },
    })
    expect(metrics?.updated_at).toBeInstanceOf(Date)
  })

  it('retrieves metrics by slug, ignoring case and surrounding whitespace', async () => {
    const { id, slug } = await insertPost()

    await expect(getPostMetricsByAny(slug)).resolves.toMatchObject({ id })
    await expect(getPostMetricsByAny(` ${slug.toUpperCase()} `)).resolves.toMatchObject({ id })
  })

  it('returns null for non-existent UUID and slug', async () => {
    await expect(getPostMetricsByAny('00000000-0000-0000-0000-000000000000')).resolves.toBeNull()
    await expect(
      getPostMetricsByAny(`non-existent-${Math.random().toString(36).slice(2, 15)}`),
    ).resolves.toBeNull()
  })

  it('throws error for invalid identifier', async () => {
    await expect(getPostMetricsByAny('invalid identifier!')).rejects.toThrow(
      /Invalid post identifier/,
    )
  })
})
