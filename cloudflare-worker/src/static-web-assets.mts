const STATIC_WEB_ASSET_EXTENSIONS = new Set([
  'avif',
  'css',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'json',
  'map',
  'mjs',
  'otf',
  'png',
  'svg',
  'ttf',
  'txt',
  'webmanifest',
  'webp',
  'woff',
  'woff2',
  'xml',
])

const NEXT_GENERATED_SOCIAL_IMAGE_SEGMENT = /^(?:opengraph-image|twitter-image)(?:-[^/]+)?$/

export const isNextImageOptimizerPath = (pathname: string): boolean => pathname === '/_next/image'

export const isStaticWebAssetPath = (pathname: string): boolean => {
  const filename = pathname.slice(pathname.lastIndexOf('/') + 1)
  if (NEXT_GENERATED_SOCIAL_IMAGE_SEGMENT.test(filename)) {
    return true
  }
  const extensionIndex = filename.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === filename.length - 1) {
    return false
  }
  return STATIC_WEB_ASSET_EXTENSIONS.has(filename.slice(extensionIndex + 1).toLowerCase())
}
