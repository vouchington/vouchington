import { describe, expect, it } from 'vitest'
import { getPostSitemapUpdateTarget } from './update-target.mts'

describe('getPostSitemapUpdateTarget', () => {
  it('returns a sitemap target for an eligible post', () => {
    expect(
      getPostSitemapUpdateTarget({
        post_type: 'discussion',
        created_at: new Date('2026-03-04T12:00:00.000Z'),
        broadcast: 'everyone',
        privacy: 'public',
        deleted_at: null,
        approved_at: new Date('2026-03-04T12:01:00.000Z'),
        slug: 'hello-world',
      }),
    ).toEqual({
      postType: 'discussion',
      day: '2026-03-04',
    })
  })

  it('returns a sitemap target for a now-deleted post when it was previously eligible', () => {
    expect(
      getPostSitemapUpdateTarget(
        {
          post_type: 'review',
          created_at: new Date('2026-03-04T12:00:00.000Z'),
          slug: 'hello-world',
        },
        {
          wasPotentiallyEligible: true,
        },
      ),
    ).toEqual({
      postType: 'review',
      day: '2026-03-04',
    })
  })

  it('returns null for unsupported or ineligible posts without the prior-state hint', () => {
    expect(
      getPostSitemapUpdateTarget({
        post_type: 'discussion',
        created_at: new Date('2026-03-04T12:00:00.000Z'),
        broadcast: 'users',
        privacy: 'public',
        deleted_at: null,
        slug: 'hello-world',
      }),
    ).toBeNull()
    expect(
      getPostSitemapUpdateTarget({
        post_type: 'comment',
        created_at: new Date('2026-03-04T12:00:00.000Z'),
        slug: 'hello-world',
      }),
    ).toBeNull()
  })
})
