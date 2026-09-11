export function getSiteOrigin(): string {
  return (
    process.env.SITE_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_ORIGIN ??
    process.env.SITEMAP_BASE_URL ??
    'https://voucha.ai'
  )
}

export function getSiteUrl(pathname: string): string {
  return new URL(pathname, getSiteOrigin()).toString()
}
