import { isPublicHostname } from '@modules/utils/urls'
import { getImageOrigin } from '@modules/utils/image-origin'
const MODERATION_IMAGE_WIDTH = 1200

export const getImageUrl = (s3Key: string, width: number = MODERATION_IMAGE_WIDTH): string => {
  const origin = getImageOrigin()
  const params = new URLSearchParams({ w: String(width) })
  return `${origin}/images/${s3Key}?${params.toString()}`
}

/**
 * Returns the image URL if the origin is a publicly reachable hostname (i.e. not localhost,
 * *.local, a non-FQDN, or a private/loopback IP), or null otherwise.
 *
 * Use this before passing or fetching an image URL to/from an external service so that
 * doomed calls to non-public origins are skipped rather than producing network errors.
 */
export function getPublicImageUrl(s3Key: string, width?: number): string | null {
  const url = getImageUrl(s3Key, width)
  try {
    return isPublicHostname(new URL(url).hostname) ? url : null
  } catch {
    // `getImageUrl` can produce a parseable URL even when the origin lacks a
    // protocol (e.g. `images.example.com/images/…`); the catch covers that
    // plus any unexpected malformations.
    return null
  }
}
