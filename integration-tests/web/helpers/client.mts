import { randomUUID } from 'node:crypto'
import { discoverOwnedAssets, type DiscoveredAsset } from './html-assets.mts'
import { TEST_USER_EMAIL } from './constants.mts'
import { insertEmailAddressLoginToken } from '../../../backend/test-helpers/entities/email-addresses.mts'
import { fetchAssetMetadataCached } from './asset-metadata-cache.mts'
import type { TracedRequest } from './backend-trace-proxy.mts'
import { printTrace, writePageArtifact } from './client-artifacts.mts'
import { WebIntegrationCookies } from './client-cookies.mts'
import { fetchWithTransportRetry, retryOnTransportError } from './fetch-retry.mts'

export interface PageLoadResult {
  response: Response
  html: string
  tracedRequests: TracedRequest[]
  assets: Array<DiscoveredAsset & { status: number; contentType: string | null }>
  requestId: string | null
}

export class WebIntegrationClient {
  private readonly cookies = new WebIntegrationCookies()
  private readonly workerOrigin: string
  private readonly traceOrigin: string
  private readonly artifactsDir: string

  constructor(workerOrigin: string, traceOrigin: string, artifactsDir: string) {
    this.workerOrigin = workerOrigin
    this.traceOrigin = traceOrigin
    this.artifactsDir = artifactsDir
  }

  // The inner request() call below is deliberately not marked idempotent -- a fixed one-time token
  // is unsafe to blindly retry at the transport level. Retrying the whole mint-and-POST here
  // instead is safe by construction: each attempt mints a fresh token, so a retried login() never
  // reuses one that may already have been consumed by an attempt whose response we never saw.
  login(): Promise<Response> {
    return retryOnTransportError(
      async () => {
        const rawToken = randomUUID()
        await insertEmailAddressLoginToken(TEST_USER_EMAIL, rawToken)
        return this.request('/api/v1/auth/email-address/login', {
          method: 'POST',
          body: {
            email_address: TEST_USER_EMAIL,
            token: rawToken,
          },
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': createUniqueLoginIp(),
          },
        })
      },
      { idempotent: true, label: 'login' },
    )
  }

  // No one-time token and idempotent in effect, so opt in explicitly rather than relying on the
  // POST method's default (non-idempotent) classification.
  logout(): Promise<Response> {
    return this.request('/api/v1/auth/logout', {
      method: 'POST',
      idempotent: true,
    })
  }

  async request(
    path: string,
    options: {
      method?: string
      headers?: Record<string, string>
      body?: unknown
      redirect?: RequestRedirect
      userAgent?: string
      timeoutMs?: number
      idempotent?: boolean
    } = {},
  ): Promise<Response> {
    const url = new URL(path, this.workerOrigin)
    const headers = new Headers(options.headers)
    const cookieHeader = this.cookies.toHeader()

    if (cookieHeader) {
      headers.set('cookie', cookieHeader)
    }

    if (options.userAgent) {
      headers.set('user-agent', options.userAgent)
    }

    const method = options.method ?? 'GET'
    const response = await fetchWithTransportRetry(
      url,
      {
        method,
        credentials: 'include',
        headers,
        body:
          options.body === undefined
            ? undefined
            : headers.get('Content-Type') === 'application/json'
              ? JSON.stringify(options.body)
              : String(options.body),
        redirect: options.redirect,
      },
      {
        method,
        idempotent: options.idempotent,
        timeoutMs: options.timeoutMs,
        label: path,
        acceptResponse: response => response.headers.has('x-request-id'),
      },
    )

    this.cookies.captureSetCookies(response)
    return response
  }

  async loadPage(
    path: string,
    artifactName: string,
    options: {
      userAgent?: string
    } = {},
  ): Promise<PageLoadResult> {
    const response = await this.request(path, { userAgent: options.userAgent })
    const requestId = response.headers.get('x-request-id')
    const html = await response.text()
    const tracedRequests = await this.getTraceRequests(requestId ?? undefined)
    const discoveredAssets = discoverOwnedAssets(html, response.url)
    const assets = await Promise.all(
      discoveredAssets.map(async asset => {
        const metadata = await this.fetchAssetMetadata(asset.url)
        return { ...asset, ...metadata }
      }),
    )

    await writePageArtifact(this.artifactsDir, artifactName, {
      page: path,
      finalUrl: response.url,
      htmlStatus: response.status,
      tracedRequests,
      discoveredAssets: assets,
    })

    printTrace(path, tracedRequests)

    return {
      response,
      html,
      tracedRequests,
      assets,
      requestId,
    }
  }

  clearCookies(): void {
    this.cookies.clear()
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name)
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  private fetchAssetMetadata(url: string): Promise<{ status: number; contentType: string | null }> {
    return fetchAssetMetadataCached(url, assetUrl =>
      this.request(new URL(assetUrl).pathname + new URL(assetUrl).search),
    )
  }

  async getTraceRequests(requestId?: string | null): Promise<TracedRequest[]> {
    if (!requestId) {
      throw new Error('getTraceRequests: requestId is required to prevent parallel test pollution')
    }
    const response = await fetch(new URL('/__trace/requests', this.traceOrigin), {
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await response.json()) as { requests: TracedRequest[] }
    return data.requests.filter(r => r.requestId === requestId)
  }
}

function createUniqueLoginIp(): string {
  const uuidHex = randomUUID().replaceAll('-', '')
  const uniqueHextets = Array.from({ length: 6 }, (_, index) =>
    uuidHex.slice(index * 4, index * 4 + 4),
  )
  return `2001:db8:${uniqueHextets.join(':')}`
}
