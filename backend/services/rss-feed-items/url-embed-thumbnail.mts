import { buildSideloadImageUrl } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import { getSigningKeys } from './signing-keys.mts'

export function buildThumbnailUrl(thumbnailUrls: Array<string | null>): string | null {
  for (const thumbnailUrl of thumbnailUrls) {
    if (!thumbnailUrl || !isHttpUrl(thumbnailUrl)) continue
    const sideloadUrl = buildSideloadImageUrl(thumbnailUrl, {
      imageOrigin: getImageOrigin(),
      width: 640,
      signingKeys: getSigningKeys(),
    })
    if (sideloadUrl) return sideloadUrl
  }
  return null
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
