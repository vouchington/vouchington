import createHttpError from 'http-errors'
import { createWikimediaClient, WikimediaHttpError } from '@vouchington/wikimedia'
import undici from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import type { WikipediaSummary, WikipediaSearchResult } from './types.mts'

const REQUEST_TIMEOUT_MS = 10_000
const USER_AGENT = 'VouchaTopicRecommender/1.0 (https://voucha.ai)'

const wikimedia = createWikimediaClient({
  fetch: fetchWikimediaGet,
  project: 'wikipedia',
  language: 'en',
  userAgent: USER_AGENT,
  timeoutMs: REQUEST_TIMEOUT_MS,
})

/* no-mistakes: integration=wikipedia */
export async function searchWikipediaByTitle(
  query: string,
  limit = 5,
): Promise<WikipediaSearchResult[]> {
  try {
    const results = await wikimedia.searchByTitle(query, { limit })
    return results.map(({ pageId, title }) => ({ pageid: pageId, title }))
  } catch (error) {
    throw mapWikimediaHttpError('search', error)
  }
}

/* no-mistakes: integration=wikipedia */
export async function getWikipediaSummary(title: string): Promise<WikipediaSummary | null> {
  try {
    const summary = await wikimedia.getPageSummary(title)
    if (summary === null) return null
    return {
      pageid: summary.pageId,
      title: summary.title,
      url: summary.url,
      extract: summary.extract,
      description: summary.description,
      thumbnail_url: summary.thumbnailUrl,
    }
  } catch (error) {
    throw mapWikimediaHttpError('summary', error)
  }
}

/* no-mistakes: integration=wikipedia */
function fetchWikimediaGet(
  url: string,
  { headers, redirect, signal }: RequestInit,
): Promise<Response> {
  return undici.fetch(url, {
    headers,
    redirect,
    signal,
    dispatcher: getExternalRequestDispatcher(),
  }) as unknown as Promise<Response>
}

function mapWikimediaHttpError(operation: 'search' | 'summary', error: unknown): unknown {
  if (!(error instanceof WikimediaHttpError)) return error

  const status = error.status >= 400 && error.status < 600 ? error.status : 500
  return createHttpError(status, `Wikipedia ${operation} failed: ${error.status}`, { cause: error })
}
