import { describe, expect, it } from 'vitest'
import { selectDirectPublicationEffects } from './direct-effect-selection.mts'
import type { LivePublicationPost } from './live-publication-posts.mts'

const livePost: LivePublicationPost = {
  id: '019c8a15-1da1-7000-8000-000000000001',
  parent_post_id: null,
  root_post_id: null,
  created_by_id: '019c8a15-1da1-7000-8000-000000000002',
  community_id: '019c8a15-1da1-7000-8000-000000000003',
  post_type: 'review',
  sitemap_day: '2026-10-26',
  is_public: true,
  eligibility_fingerprint: 'current',
}

describe('selectDirectPublicationEffects', () => {
  it('unions old identities with current post identities and keeps a deleted post', () => {
    const removedId = '019c8a15-1da1-7000-8000-000000000004'
    const result = selectDirectPublicationEffects(
      [
        { kind: 'impact_post', uuidValue: livePost.id },
        { kind: 'impact_post', uuidValue: removedId },
        { kind: 'identity_author_username', textValue: 'old-author' },
        { kind: 'identity_community_slug', textValue: 'old-community' },
        { kind: 'identity_post_slug', textValue: 'old-post' },
        { kind: 'sitemap_target', postType: 'review', day: '2026-10-25' },
      ],
      [livePost],
    )

    expect(result.missingPostIds).toEqual([removedId])
    expect(result.identityKeys).toEqual(
      expect.arrayContaining([
        { kind: 'author', value: 'old-author' },
        { kind: 'author', value: livePost.created_by_id },
        { kind: 'community_slug', value: 'old-community' },
        { kind: 'community', value: livePost.community_id },
        { kind: 'post_slug', value: 'old-post' },
      ]),
    )
    expect(result.sitemapTargets).toEqual([
      { postType: 'review', day: '2026-10-25' },
      { postType: 'review', day: '2026-10-26' },
    ])
  })

  it('retains effects for a scope with no live posts', () => {
    const result = selectDirectPublicationEffects(
      [
        { kind: 'identity_rss_feed', uuidValue: '019c8a15-1da1-7000-8000-000000000005' },
        { kind: 'impact_topic', uuidValue: '019c8a15-1da1-7000-8000-000000000006' },
      ],
      [],
    )
    expect(result.posts).toEqual([])
    expect(result.identityKeys).toEqual([
      { kind: 'rss_feed', value: '019c8a15-1da1-7000-8000-000000000005' },
    ])
    expect(result.topicIds).toEqual(['019c8a15-1da1-7000-8000-000000000006'])
  })
})
