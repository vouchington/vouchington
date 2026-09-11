import { describe, expect, it } from 'vitest'
import { enqueuePendingCrawlEmbed, getEmbedMetadataUpdate } from './embed-plan.mts'

describe('enqueuePendingCrawlEmbed', () => {
  it('reports and skips a malformed persisted endpoint', async () => {
    await expect(
      enqueuePendingCrawlEmbed({
        id: 'crawl-id',
        embed_oembed_url: 'not-a-url',
        embed_oembed_resolved_at: null,
      } as never),
    ).resolves.toBeUndefined()
  })

  it('persists a successful no-match as an authoritative clear', () => {
    const update = getEmbedMetadataUpdate(
      { content: {}, embedMetadata: null, embedOEmbedUrl: null } as never,
      undefined,
    )
    expect(update.embed_metadata).toBeNull()
    expect(update.embed_oembed_url).toBeNull()
    expect(update.embed_oembed_resolved_at).toBeInstanceOf(Date)
  })
})
