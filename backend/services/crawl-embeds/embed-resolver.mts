import onError from '@modules/on-error'
import { getExternalFetch, getPinnedRequestDispatcher } from '@modules/utils/http-dispatchers'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import {
  createEmbedResolver,
  type EmbedAuthorizationContext,
  type EmbedResolutionPlan,
  type EmbedResolver,
  type EmbedResolverOptions,
  type ResolveEmbedOptions,
} from '@vouchington/embeds'
import { peerTubeProvider, vimeoProvider, youtubeProvider } from '@vouchington/embeds/providers'
import type { CrawlerHtmlToMarkdownResult } from '@vouchington/crawler-html'
import { validateUrl, type ResolvedSafeAddress } from 'ssrf-guard/node'
import type { Dispatcher } from 'undici'

const PROVIDERS = [youtubeProvider, vimeoProvider, peerTubeProvider] as const

// The resolver's total per-destination fetch budget (unchanged from before this file named it).
const EMBED_FETCH_TIMEOUT_MS = 5000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS). This is a *separate*
// budget from EMBED_FETCH_TIMEOUT_MS above for the resolution phase specifically — the two phases
// stay independent, matching the #10772 per-phase model.
const DNS_TIMEOUT_MS = 5000

export interface CrawlEmbedResolverDependencies {
  createEmbedResolver(options: EmbedResolverOptions): EmbedResolver
  fetch: EmbedResolverOptions['fetch']
  getPinnedDispatcher(addresses: ResolvedSafeAddress[]): Dispatcher
  reportError(error: unknown): void
  validateUrl: typeof validateUrl
}

const defaultDependencies: CrawlEmbedResolverDependencies = {
  createEmbedResolver,
  fetch: getExternalFetch() as EmbedResolverOptions['fetch'],
  getPinnedDispatcher: getPinnedRequestDispatcher,
  reportError: onError,
  validateUrl,
}

export function createCrawlEmbedResolver(
  dependencies: CrawlEmbedResolverDependencies = defaultDependencies,
) {
  const resolver = dependencies.createEmbedResolver({
    authorizeUrl: authorizeEmbedUrl,
    fetch: dependencies.fetch,
    maxRedirects: 5,
    providers: PROVIDERS,
    // ResolveHttpDestination types `signal` as `AbortSignal | null | undefined` — @vouchington/http-transport's
    // redirecting-fetch.mjs already supplies a live AbortSignal.timeout(EMBED_FETCH_TIMEOUT_MS), which this
    // used to silently drop. Forward it and pass DNS_TIMEOUT_MS as a second, independent racer, so the
    // resolution phase stays bounded structurally rather than by the caller's current behavior.
    resolveDestination: async (url, signal) => ({
      dispatcher: dependencies.getPinnedDispatcher(
        await dependencies.validateUrl(url.toString(), {
          signal: signal ?? undefined,
          timeoutMs: DNS_TIMEOUT_MS,
        }),
      ),
    }),
    timeoutMs: EMBED_FETCH_TIMEOUT_MS,
    userAgent: CRAWLER_USER_AGENT,
  })

  return {
    async plan(
      documentUrl: string,
      content: CrawlerHtmlToMarkdownResult,
    ): Promise<EmbedResolutionPlan | null | undefined> {
      try {
        return await resolver.planExtracted({ documentUrl, content })
      } catch (error) {
        dependencies.reportError(error)
        return undefined
      }
    },
    resolve: (plan: EmbedResolutionPlan, options?: ResolveEmbedOptions) =>
      options === undefined ? resolver.resolveOEmbed(plan) : resolver.resolveOEmbed(plan, options),
  }
}

const crawlerEmbedResolver = createCrawlEmbedResolver()
export const planCrawlerEmbed = crawlerEmbedResolver.plan
export const resolveCrawlerOEmbed = crawlerEmbedResolver.resolve

function authorizeEmbedUrl(url: URL, context: EmbedAuthorizationContext): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  if (context.purpose === 'document') return url.href === context.sourceUrl.href
  if (context.purpose === 'oembed') return isAuthorizedOEmbedUrl(url, context.sourceUrl)
  return isAuthorizedPlayerUrl(url, context.sourceUrl)
}

function isAuthorizedOEmbedUrl(url: URL, sourceUrl: URL): boolean {
  return (
    (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') ||
    (url.hostname === 'vimeo.com' && url.pathname === '/api/oembed.json') ||
    (url.hostname === sourceUrl.hostname && url.pathname === '/services/oembed')
  )
}

function isAuthorizedPlayerUrl(url: URL, sourceUrl: URL): boolean {
  return (
    (url.hostname === 'www.youtube-nocookie.com' && url.pathname.startsWith('/embed/')) ||
    (url.hostname === 'player.vimeo.com' && url.pathname.startsWith('/video/')) ||
    (url.hostname === sourceUrl.hostname && url.pathname.startsWith('/videos/embed/'))
  )
}
