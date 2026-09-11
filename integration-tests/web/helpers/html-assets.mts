import { JSDOM } from 'jsdom'

const LINK_REL_ASSET_TYPES = new Set([
  'stylesheet',
  'preload',
  'icon',
  'apple-touch-icon',
  'manifest',
])

export interface DiscoveredAsset {
  url: string
  source: string
}

export function discoverOwnedAssets(html: string, pageUrl: string): DiscoveredAsset[] {
  const dom = new JSDOM(html, { url: pageUrl })
  const document = dom.window.document
  const assets = new Map<string, DiscoveredAsset>()

  for (const element of document.querySelectorAll('script[src]')) {
    const src = element.getAttribute('src')
    if (!src) continue
    addAsset(assets, src, pageUrl, 'script')
  }

  for (const element of document.querySelectorAll('link[href]')) {
    const href = element.getAttribute('href')
    const rel = (element.getAttribute('rel') ?? '').toLowerCase()

    if (!href) continue
    if (!LINK_REL_ASSET_TYPES.has(rel)) {
      continue
    }

    addAsset(assets, href, pageUrl, `link:${rel}`)
  }

  for (const element of document.querySelectorAll('img[src]')) {
    const src = element.getAttribute('src')
    if (!src) continue
    addAsset(assets, src, pageUrl, 'img')
  }

  for (const selector of [
    'meta[property="og:image"][content]',
    'meta[name="twitter:image"][content]',
  ]) {
    for (const element of document.querySelectorAll(selector)) {
      const value = element.getAttribute('content')
      if (!value) continue
      addAsset(assets, value, pageUrl, selector)
    }
  }

  return Array.from(assets.values())
}

function addAsset(
  assets: Map<string, DiscoveredAsset>,
  value: string,
  pageUrl: string,
  source: string,
): void {
  const assetUrl = new URL(value, pageUrl)

  if (assetUrl.origin !== new URL(pageUrl).origin) {
    return
  }

  if (!isOwnedAssetPath(assetUrl.pathname)) {
    return
  }

  assets.set(assetUrl.toString(), {
    url: assetUrl.toString(),
    source,
  })
}

function isOwnedAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/sideload/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname.endsWith('.webmanifest')
  )
}
