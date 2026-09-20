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
  return getDeliveryUrl(`/images/${imageId}`, opts)
}

/**
 * Builds a placement-bound delivery URL for media attached to a post. The
 * revision is part of the delivery identity so edge authorization can reject
 * stale, replaced, or withheld placement URLs.
 */
export function getPlacementImageUrl(
  placementId: string,
  placementRevision: number,
  imageId: string,
  opts: { width: number; quality?: number },
): string {
  return getDeliveryUrl(`/images/placements/${placementId}/${placementRevision}/${imageId}`, opts)
}

function getDeliveryUrl(pathname: string, opts: { width: number; quality?: number }): string {
  const params = new URLSearchParams({ w: String(opts.width) })
  if (opts.quality != null) params.set('q', String(opts.quality))
  const path = `${pathname}?${params.toString()}`
  const host = getImageOrigin()
  return host ? `${host}${path}` : path
}

/**
 * Returns an SEO-safe placement URL for a persisted post image. Post media
 * retains its placement binding outside in-progress upload previews.
 */
export function buildPlacementImagePath(
  image?: { image_id: string; placement_id: string; placement_revision: number } | null,
  width: number = 1200,
): string | undefined {
  if (!image) return undefined
  return getPlacementImageUrl(image.placement_id, image.placement_revision, image.image_id, {
    width,
  })
}
