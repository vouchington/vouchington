import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { getCrawlById } from '@services/crawls/get'
import { updateCrawl } from '@services/crawls/update'
import { addUrl } from '@services/urls/upsert'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { OEmbedHttpError, type EmbedResolutionPlan, type ResolvedEmbed } from '@vouchington/embeds'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveCrawlOEmbed } from '@services/crawl-embeds/resolve-crawl-oembed'

const ENDPOINT = 'https://www.youtube.com/oembed?url=video-123'

describe('resolveCrawlOEmbed', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('enriches only the exact crawl and skips a replay after completion', async () => {
    const first = await createPendingCrawl(user, 'first')
    const { crawlId, crawlerId, urlId } = first
    const sibling = await createPendingCrawl(user, 'sibling', urlId, crawlerId)
    const enriched = metadata('Remote title')
    const resolve = vi.fn<(plan: EmbedResolutionPlan) => Promise<ResolvedEmbed>>(
      async () => enriched,
    )

    await expect(resolveCrawlOEmbed(crawlId, { resolve })).resolves.toBe('resolved')
    await expect(resolveCrawlOEmbed(crawlId, { resolve })).resolves.toBe('skipped')

    const updated = await getCrawlById(crawlId, urlId)
    expect(updated?.embed_metadata).toEqual(enriched)
    expect(updated?.embed_oembed_resolved_at).toBeInstanceOf(Date)
    const unchangedSibling = await getCrawlById(sibling.crawlId, urlId)
    expect(unchangedSibling?.embed_metadata?.title).toBe('Local sibling')
    expect(unchangedSibling?.embed_oembed_resolved_at).toBeNull()
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('leaves the crawl pending when remote enrichment rejects', async () => {
    const { crawlId, urlId } = await createPendingCrawl(user, 'failure')
    const error = new OEmbedHttpError(new Response(null, { status: 503 }))
    await expect(
      resolveCrawlOEmbed(crawlId, {
        resolve: vi
          .fn<(plan: EmbedResolutionPlan) => Promise<ResolvedEmbed>>()
          .mockRejectedValue(error),
      }),
    ).rejects.toBe(error)
    const crawl = await getCrawlById(crawlId, urlId)
    expect(crawl?.embed_metadata?.title).toBe('Local failure')
    expect(crawl?.embed_oembed_resolved_at).toBeNull()
  })

  it.each([404, 410])('completes a permanently rejected endpoint with HTTP %i', async status => {
    const { crawlId, urlId } = await createPendingCrawl(user, `permanent-${status}`)
    const resolve = vi
      .fn<(plan: EmbedResolutionPlan) => Promise<ResolvedEmbed>>()
      .mockRejectedValue(new OEmbedHttpError(new Response(null, { status })))

    await expect(resolveCrawlOEmbed(crawlId, { resolve })).resolves.toBe('resolved')
    await expect(resolveCrawlOEmbed(crawlId, { resolve })).resolves.toBe('skipped')

    const crawl = await getCrawlById(crawlId, urlId)
    expect(crawl?.embed_metadata?.title).toBe(`Local permanent-${status}`)
    expect(crawl?.embed_oembed_resolved_at).toBeInstanceOf(Date)
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('rejects invalid crawl IDs before remote work', async () => {
    const resolve = vi.fn<(plan: EmbedResolutionPlan) => Promise<ResolvedEmbed>>()
    await expect(resolveCrawlOEmbed('invalid', { resolve })).rejects.toThrow('Invalid crawl ID')
    expect(resolve).not.toHaveBeenCalled()
  })
})

async function createPendingCrawl(
  user: PrivateUser,
  label: string,
  existingUrlId?: string,
  existingCrawlerId?: string,
) {
  const url = existingUrlId
    ? null
    : (await addUrl(user.id, `https://${label}-${Math.random()}.example.com/video`))!
  const urlId = existingUrlId ?? url!.id
  const crawlerId =
    existingCrawlerId ??
    (await createCrawler(user, { crawler_type: 'fetch', hostname_id: url!.hostname.id })).id
  const crawl = await createCrawl(urlId, crawlerId)
  await updateCrawl(crawl.id, urlId, {
    embed_metadata: metadata(`Local ${label}`),
    embed_oembed_resolved_at: null,
    embed_oembed_url: ENDPOINT,
  })
  return { crawlId: crawl.id, crawlerId, urlId }
}

function metadata(title: string): ResolvedEmbed {
  return {
    kind: 'article',
    requestedUrl: 'https://example.com/video',
    resolvedUrl: 'https://example.com/video',
    title,
    description: null,
    author: null,
    provider: null,
    thumbnail: null,
    player: null,
  }
}
