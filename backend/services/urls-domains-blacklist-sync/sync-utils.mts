import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { normalizeDomain } from '@services/urls-domains-blacklist/domains'
import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist/sources'

export async function* readNormalizedDomains(response: Response): AsyncGenerator<string> {
  const body = response.body
  if (!body) return

  const lineReader = createInterface({
    input: Readable.fromWeb(body),
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lineReader) {
      const domain = normalizeDomain(line)
      if (domain) yield domain
    }
  } finally {
    lineReader.close()
  }
}

export function getCacheHeadersFromResponse(response: Response): {
  etag: string | null
  lastModifiedAt: Date | null
} {
  return {
    etag: response.headers.get('etag'),
    lastModifiedAt: parseLastModifiedHeader(response.headers.get('last-modified')),
  }
}

function parseLastModifiedHeader(lastModified: string | null): Date | null {
  if (!lastModified) return null

  const parsed = new Date(lastModified)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function parseSourceId(sourceId: DomainBlacklistSourceId): string {
  if (typeof sourceId === 'number' && !Number.isSafeInteger(sourceId)) {
    throw new Error(`Invalid sourceId: ${sourceId}`)
  }

  const id = String(sourceId)
  if (!/^\d+$/.test(id)) throw new Error(`Invalid sourceId: ${sourceId}`)
  return id
}

export function createFetchError(status: number, statusText: string): Error & { status: number } {
  const error = new Error(`Failed to fetch domain blacklist: ${status} ${statusText}`) as Error & {
    status: number
  }
  error.status = status
  return error
}

export function createSourceNotFoundError(
  sourceId: DomainBlacklistSourceId,
): Error & { status: number } {
  const error = new Error(`Blacklist source not found: ${sourceId}`) as Error & { status: number }
  error.status = 404
  return error
}

export function createSyncFailedError(url: string, cause: unknown): Error {
  return new Error(`Failed to sync blacklist from ${url}: ${cause}`)
}
