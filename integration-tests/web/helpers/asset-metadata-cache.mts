import { createCrossProcessConcurrencyLimiter } from './concurrency.mts'

export interface AssetMetadata {
  status: number
  contentType: string | null
}

// Framework/webpack/vendor chunks under /_next/static/* are public and content-hashed, so a
// worker-local URL cache safely collapses repeated and concurrent `loadPage()` fetches. The
// cross-process limiter protects the single Wrangler instance shared by all Vitest forks.
const cache = new Map<string, Promise<AssetMetadata>>()
let runAssetFetch: ReturnType<typeof createCrossProcessConcurrencyLimiter> | undefined

function assetFetchLimiter(): ReturnType<typeof createCrossProcessConcurrencyLimiter> {
  if (!runAssetFetch) {
    const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
    if (!traceOrigin) throw new Error('WEB_INTEGRATION_TRACE_ORIGIN is required')
    runAssetFetch = createCrossProcessConcurrencyLimiter(traceOrigin)
  }
  return runAssetFetch
}

export function fetchAssetMetadataCached(
  url: string,
  fetchAsset: (url: string) => Promise<Response>,
): Promise<AssetMetadata> {
  const cacheable = new URL(url, 'http://localhost').pathname.startsWith('/_next/static/')
  const cached = cacheable ? cache.get(url) : undefined
  if (cached) return cached

  const pending = assetFetchLimiter()(async () => {
    const response = await fetchAsset(url)
    await response.arrayBuffer()
    return { status: response.status, contentType: response.headers.get('content-type') }
  })
  if (cacheable) cache.set(url, pending)
  void pending
    .then(metadata => {
      if (metadata.status >= 400) cache.delete(url)
    })
    .catch(() => cache.delete(url))
  return pending
}
