// Mint URLs for image delivery. Production and staging point at the dedicated
// CloudFront subdomains so the browser bypasses the Cloudflare Worker entirely
// (DNS for `images{,-staging}.voucha.ai` resolves directly to CloudFront).
//
// The image origin is a *runtime* env var (`IMAGE_ORIGIN`, no NEXT_PUBLIC_
// prefix) so the same Docker image deploys to both staging and production —
// the ECS task definition supplies the per-environment value at boot. For
// client components, the value is mirrored onto `window.__IMAGE_ORIGIN__` by
// the root layout's bootstrap script. Local dev leaves it unset and emits
// relative `/images/...` URLs that the dev server resolves itself.

import { getImageOrigin } from './image-origin'

export function getImageUrl(imageId: string, opts: { width: number; quality?: number }): string {
  const params = new URLSearchParams({ w: String(opts.width) })
  if (opts.quality != null) params.set('q', String(opts.quality))
  const path = `/images/${imageId}?${params.toString()}`
  const host = getImageOrigin()
  return host ? `${host}${path}` : path
}

export function buildImagePath(imageId?: string | null, width: number = 1200): string | undefined {
  if (!imageId) return undefined
  return getImageUrl(imageId, { width })
}
