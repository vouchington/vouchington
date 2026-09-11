import NextImage, { type ImageProps } from 'next/image'
import { assertProxiedImageSrc, isSideloadImageSrc } from '@/lib/utils/assert-proxied-image-src'

/**
 * Drop-in wrapper for `next/image` that asserts every external image URL has
 * been routed through the image origin's `/sideload/` proxy. The assertion only runs in
 * dev/test; production builds are unaffected.
 *
 * Sideload URLs bypass Next optimization so the browser requests IMAGE_ORIGIN directly.
 * Import as `ProxiedImage` (or aliased as `Image`) instead of bare `next/image`.
 */
export function ProxiedImage({ src, ...props }: ImageProps) {
  if (typeof src === 'string') {
    assertProxiedImageSrc(src)
  }
  return (
    <NextImage
      src={src}
      {...props}
      unoptimized={typeof src === 'string' && isSideloadImageSrc(src) ? true : props.unoptimized}
    />
  )
}
