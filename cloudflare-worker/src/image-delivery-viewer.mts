import { normalizeCountryCode } from '@ts-shared/languages/countries'

export type TrustedViewerCountry =
  | { readonly attribution: 'known'; readonly countryCode: string }
  | { readonly attribution: 'unknown' }

export type ImageDeliveryEdgePolicy =
  | { readonly effect: 'withheld' }
  | { readonly effect: 'allow'; readonly deniedCountryCodes: readonly string[] }

type ViewerRequest = {
  readonly cf?: { readonly country?: unknown }
  readonly headers: Headers
}

type ImageByteCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** Trusted WAF country. Caller-supplied CF-IPCountry is ignored. */
export function readTrustedViewerCountry(request: ViewerRequest): TrustedViewerCountry {
  const countryCode = normalizeCountryCode(
    typeof request.cf?.country === 'string' ? request.cf.country : null,
  )
  return countryCode === null ? { attribution: 'unknown' } : { attribution: 'known', countryCode }
}

export function trustedViewerCountryCode(request: ViewerRequest): string | null {
  const viewer = readTrustedViewerCountry(request)
  return viewer.attribution === 'known' ? viewer.countryCode : null
}

export function authorizeImageDeliveryViewer(
  policy: ImageDeliveryEdgePolicy,
  viewer: TrustedViewerCountry,
): 'deliver' | 'unavailable' {
  if (policy.effect === 'withheld') return 'unavailable'
  if (policy.deniedCountryCodes.length === 0) return 'deliver'
  if (viewer.attribution === 'unknown') return 'unavailable'
  return policy.deniedCountryCodes.includes(viewer.countryCode) ? 'unavailable' : 'deliver'
}

/** Authorizes before any shared byte. The unavailable response is not cached. */
export async function deliverCachedImagePlacement(input: {
  cache: ImageByteCache
  cacheKey: Request
  policy: ImageDeliveryEdgePolicy
  viewer: TrustedViewerCountry
  loadBytes: () => Promise<Uint8Array>
}): Promise<Response> {
  if (authorizeImageDeliveryViewer(input.policy, input.viewer) === 'unavailable') {
    return new Response('Unavailable', {
      status: 404,
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }
  const cached = await input.cache.match(input.cacheKey)
  if (cached) return cached
  const bytes = await input.loadBytes()
  const response = new Response(bytes, {
    status: 200,
    headers: { 'cache-control': 'public, max-age=31536000', 'content-type': 'image/jpeg' },
  })
  await input.cache.put(input.cacheKey, response.clone())
  return response
}
