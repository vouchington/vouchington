export const PLAYWRIGHT_PODCAST_COVER_URL = 'https://playwright.invalid/podcast-cover.png'
export const PLAYWRIGHT_SIDELOAD_IMAGE_URL = PLAYWRIGHT_PODCAST_COVER_URL

export const PLAYWRIGHT_PODCAST_COVER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

export function isPlaywrightPodcastCoverRequest(pathname: string): boolean {
  const encoded = pathname.match(/^\/sideload\/([^/]+)$/)?.[1]
  if (!encoded) return false
  return Buffer.from(encoded, 'base64url').toString('utf8') === PLAYWRIGHT_PODCAST_COVER_URL
}
