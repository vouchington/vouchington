import { describe, expect, it } from 'vitest'
import { adminNativeUrlEmbed, publicNativeUrlEmbed } from './native-domain-url-data.mts'
import { rssFeedItemDetailBody, rssFeedItemsFeedBody } from './rss-feed-items-data.mts'

describe('RSS feed item embed fixtures', () => {
  it('uses public-safe embed projections for member-auth responses', () => {
    for (const body of [rssFeedItemDetailBody, rssFeedItemsFeedBody]) {
      const embed = Object.values(body.rss_feed_item_embeds)[0]
      expect(embed).toMatchObject({
        markdown: null,
        embed_metadata: null,
        meta_tags: null,
        embed_oembed_url: null,
        embed_oembed_resolved_at: null,
      })
    }
  })

  it('keeps complete embed projections available for fixture-admin responses', () => {
    expect(adminNativeUrlEmbed).toMatchObject({
      embed_metadata: expect.objectContaining({ kind: 'player' }),
      meta_tags: expect.any(Object),
      embed_oembed_url: expect.any(String),
      embed_oembed_resolved_at: expect.any(String),
    })
    expect(publicNativeUrlEmbed).toMatchObject({
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    })
  })
})
