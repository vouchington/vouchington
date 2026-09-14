import onError from '@modules/on-error'
import { readResponseBodyAsBuffer } from '@modules/utils/http'
import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils/urls'
import { safeFetch, UnsafeUrlError } from 'ssrf-guard/node'
import { stringValue } from './chapters-values.mts'
import { normalizePodcastChapters, type PodcastChapter } from './chapters-normalize.mts'
import { getRssFeedItemById } from './get.mts'

const CHAPTERS_FETCH_TIMEOUT_MS = 5000
const CHAPTERS_MAX_REDIRECT_HOPS = 5
const CHAPTERS_MAX_SIZE_BYTES = 256 * 1024
const CHAPTERS_CONTENT_TYPES = 'application/json, application/*+json;q=0.9, */*;q=0.1'

export { normalizePodcastChapters, type PodcastChapter } from './chapters-normalize.mts'

export type ChaptersSafeFetch = (
  initialUrl: Parameters<typeof safeFetch>[0],
  options?: Parameters<typeof safeFetch>[1],
) => Promise<Pick<Awaited<ReturnType<typeof safeFetch>>, 'body' | 'ok' | 'url'>>

type ChaptersDependencies = {
  getRssFeedItemById: typeof getRssFeedItemById
  safeFetch: ChaptersSafeFetch
  readResponseBodyAsBuffer: typeof readResponseBodyAsBuffer
  onError: typeof onError
}

const defaultDependencies: ChaptersDependencies = {
  getRssFeedItemById,
  safeFetch,
  readResponseBodyAsBuffer,
  onError,
}

export async function getPodcastEpisodeChaptersById(
  rssFeedItemId: string,
  dependencies: Partial<ChaptersDependencies> = {},
): Promise<PodcastChapter[]> {
  const deps = { ...defaultDependencies, ...dependencies }
  const item = await deps.getRssFeedItemById(rssFeedItemId)
  if (!item) return []

  const chaptersUrl = normalizedHttpsUrl(item.data.chapters_url)
  if (!chaptersUrl) return []
  if (!isSupportedChaptersType(item.data.chapters_type)) return []

  try {
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`Chapter fetch timed out for ${chaptersUrl}`))
    }, CHAPTERS_FETCH_TIMEOUT_MS)
    try {
      const response = await deps.safeFetch(chaptersUrl, {
        headers: { Accept: CHAPTERS_CONTENT_TYPES },
        allowedProtocols: ['https:'],
        maxRedirects: CHAPTERS_MAX_REDIRECT_HOPS,
        signal: abortController.signal,
      })
      if (!response.ok) {
        await response.body?.cancel().catch(onError)
        return []
      }
      const body = await deps.readResponseBodyAsBuffer({
        response,
        url: response.url,
        maxSizeBytes: CHAPTERS_MAX_SIZE_BYTES,
        signal: abortController.signal,
      })
      return normalizePodcastChapters(JSON.parse(body.toString('utf-8')))
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) return []
    deps.onError(error instanceof Error ? error : new Error(String(error)))
    return []
  }
}

function normalizedHttpsUrl(value: unknown): string | null {
  const url = normalizedHttpUrl(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && isPublicHostname(parsed.hostname) ? url : null
  } catch {
    return null
  }
}

function normalizedHttpUrl(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null
  try {
    return normalizeUrlForUrlTable(raw, { preserveHttp: true }).toString()
  } catch {
    return null
  }
}

function isSupportedChaptersType(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  return normalized.includes('json')
}
