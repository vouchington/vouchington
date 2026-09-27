import { describe, expect, it } from 'vitest'
import { adminNativeUrlEmbed, publicNativeUrlEmbed } from './native-domain-url-data.mts'
import { rssFeedItemDetailBody, rssFeedItemsFeedBody } from './rss-feed-items-data.mts'
import { nativeContentDetailApiFixtureCases } from './native-content-detail-cases.mts'

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

describe('bounded story page fixtures', () => {
  it('replays the first page cursor on continuation and keeps sidecars page-local', () => {
    const first = nativeContentDetailApiFixtureCases.find(
      fixtureCase => fixtureCase.id === 'native.stories.get.default',
    )!
    const after = nativeContentDetailApiFixtureCases.find(
      fixtureCase => fixtureCase.id === 'native.stories.get.after',
    )!
    const firstBody = first.body as {
      item_ids: string[]
      page_info: {
        end_cursor: string | null
        has_next_page: boolean
      }
      rss_feed_items: Record<string, unknown>
    }
    const afterBody = after.body as typeof firstBody
    expect(firstBody.page_info).toMatchObject({
      has_next_page: true,
      end_cursor: expect.any(String),
    })
    expect(after.query?.after).toBe(firstBody.page_info.end_cursor)
    expect(after.query?.exclude_item_id).toBe(first.query?.exclude_item_id)
    expect(afterBody.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(firstBody.item_ids).toHaveLength(1)
    expect(afterBody.item_ids).toHaveLength(1)
    expect(new Set([...firstBody.item_ids, ...afterBody.item_ids]).size).toBe(2)
    expect(Object.keys(firstBody.rss_feed_items)).toEqual(firstBody.item_ids)
    expect(Object.keys(afterBody.rss_feed_items)).toEqual(afterBody.item_ids)
  })
})
