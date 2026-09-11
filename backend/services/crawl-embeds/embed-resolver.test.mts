import type {
  EmbedResolutionPlan,
  EmbedResolver,
  EmbedResolverOptions,
  ResolvedEmbed,
} from '@vouchington/embeds'
import type { CrawlerHtmlToMarkdownResult } from '@vouchington/crawler-html'
import type { ResolvedSafeAddress } from 'ssrf-guard/node'
import type { Dispatcher } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import { createCrawlEmbedResolver } from './embed-resolver.mts'

const DOCUMENT_URL = 'https://www.youtube.com/watch?v=video-123'
const CONTENT: CrawlerHtmlToMarkdownResult = {
  content: 'Document content',
  lang: 'en',
  links: {},
  meta: {},
  title: 'Document title',
}
const EMBED: ResolvedEmbed = {
  kind: 'player',
  requestedUrl: DOCUMENT_URL,
  resolvedUrl: DOCUMENT_URL,
  title: 'Video title',
  description: null,
  author: null,
  provider: { key: 'youtube', name: null, url: null, resourceId: 'video-123' },
  thumbnail: null,
  player: {
    url: 'https://www.youtube-nocookie.com/embed/video-123',
    width: null,
    height: null,
  },
}
const PLAN: EmbedResolutionPlan = {
  embed: EMBED,
  oEmbedUrl: 'https://www.youtube.com/oembed?url=video-123',
}

function setup() {
  let resolverOptions: EmbedResolverOptions | undefined
  const planExtracted = vi.fn<EmbedResolver['planExtracted']>().mockResolvedValue(PLAN)
  const resolveOEmbed = vi.fn<EmbedResolver['resolveOEmbed']>().mockResolvedValue(EMBED)
  const createEmbedResolver = vi.fn<(options: EmbedResolverOptions) => EmbedResolver>(options => {
    resolverOptions = options
    return {
      planExtracted,
      resolve: vi.fn<EmbedResolver['resolve']>(),
      resolveExtracted: vi.fn<EmbedResolver['resolveExtracted']>(),
      resolveOEmbed,
    }
  })
  const fetch = vi.fn<EmbedResolverOptions['fetch']>()
  const validateUrl = vi
    .fn<
      (
        url: string,
        options?: { signal?: AbortSignal; timeoutMs?: number },
      ) => Promise<ResolvedSafeAddress[]>
    >()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 as const }])
  const dispatcher = { dispatch: vi.fn<() => void>() } as unknown as Dispatcher
  const getPinnedDispatcher = vi.fn<(addresses: ResolvedSafeAddress[]) => Dispatcher>(
    () => dispatcher,
  )
  const reportError = vi.fn<(error: unknown) => void>()
  const resolver = createCrawlEmbedResolver({
    createEmbedResolver,
    fetch,
    getPinnedDispatcher,
    reportError,
    validateUrl,
  })
  return {
    dispatcher,
    getPinnedDispatcher,
    planExtracted,
    reportError,
    validateUrl,
    resolveOEmbed,
    resolver,
    resolverOptions: () => resolverOptions!,
  }
}

describe('crawl embed resolver', () => {
  it('plans from extracted HTML without performing remote work', async () => {
    const { planExtracted, resolver } = setup()
    await expect(resolver.plan(DOCUMENT_URL, CONTENT)).resolves.toEqual(PLAN)
    expect(planExtracted).toHaveBeenCalledWith({ documentUrl: DOCUMENT_URL, content: CONTENT })
  })

  it('keeps the strict remote phase available to the queue worker', async () => {
    const { resolveOEmbed, resolver } = setup()
    await expect(resolver.resolve(PLAN)).resolves.toEqual(EMBED)
    expect(resolveOEmbed).toHaveBeenCalledWith(PLAN)
  })

  it('authorizes only the crawled document and provider endpoints', async () => {
    const { resolverOptions } = setup()
    const sourceUrl = new URL(DOCUMENT_URL)
    const authorize = resolverOptions().authorizeUrl
    expect(await authorize(sourceUrl, { purpose: 'document', sourceUrl })).toBe(true)
    expect(
      await authorize(new URL('https://attacker.example/document'), {
        purpose: 'document',
        sourceUrl,
      }),
    ).toBe(false)
    expect(
      await authorize(new URL('https://www.youtube.com/oembed?url=example'), {
        purpose: 'oembed',
        sourceUrl,
      }),
    ).toBe(true)
    expect(
      await authorize(new URL('https://attacker.example/oembed'), {
        purpose: 'oembed',
        sourceUrl,
      }),
    ).toBe(false)
    const peerTubeSource = new URL('https://peertube.example/w/video-123')
    expect(
      await authorize(new URL('https://peertube.example/services/oembed'), {
        purpose: 'oembed',
        sourceUrl: peerTubeSource,
      }),
    ).toBe(true)
    expect(
      await authorize(new URL('https://peertube.example/videos/embed/video-123'), {
        purpose: 'player',
        sourceUrl: peerTubeSource,
      }),
    ).toBe(true)
  })

  it('DNS-validates each remote destination with a bounded timeout and pins its dispatcher', async () => {
    const { dispatcher, getPinnedDispatcher, validateUrl, resolverOptions } = setup()
    const endpoint = new URL('https://www.youtube.com/oembed?url=example')
    await expect(resolverOptions().resolveDestination(endpoint, undefined)).resolves.toEqual({
      dispatcher,
    })
    expect(validateUrl).toHaveBeenCalledWith(endpoint.toString(), {
      signal: undefined,
      timeoutMs: expect.any(Number),
    })
    const [, options] = validateUrl.mock.calls[0]!
    expect(options?.timeoutMs).toBeGreaterThan(0)
    expect(getPinnedDispatcher).toHaveBeenCalledWith([{ address: '93.184.216.34', family: 4 }])
  })

  it('forwards a live caller AbortSignal into DNS resolution instead of dropping it', async () => {
    const { validateUrl, resolverOptions } = setup()
    const endpoint = new URL('https://www.youtube.com/oembed?url=example')
    const abortController = new AbortController()

    await resolverOptions().resolveDestination(endpoint, abortController.signal)

    expect(validateUrl).toHaveBeenCalledWith(endpoint.toString(), {
      signal: abortController.signal,
      timeoutMs: expect.any(Number),
    })
  })

  it('falls back to undefined (not null) when the caller passes a null signal', async () => {
    const { validateUrl, resolverOptions } = setup()
    const endpoint = new URL('https://www.youtube.com/oembed?url=example')

    await resolverOptions().resolveDestination(endpoint, null)

    expect(validateUrl).toHaveBeenCalledWith(endpoint.toString(), {
      signal: undefined,
      timeoutMs: expect.any(Number),
    })
  })

  it('keeps a successful crawl when local planning fails', async () => {
    const setupResult = setup()
    const error = new Error('planning failed')
    setupResult.planExtracted.mockRejectedValueOnce(error)
    await expect(setupResult.resolver.plan(DOCUMENT_URL, CONTENT)).resolves.toBeUndefined()
    expect(setupResult.reportError).toHaveBeenCalledWith(error)
  })

  it('distinguishes a successful no-match from a planning failure', async () => {
    const setupResult = setup()
    setupResult.planExtracted.mockResolvedValueOnce(null as never)
    await expect(setupResult.resolver.plan(DOCUMENT_URL, CONTENT)).resolves.toBeNull()
    expect(setupResult.reportError).not.toHaveBeenCalled()
  })
})
