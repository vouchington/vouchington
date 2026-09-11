import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import { buildStaticPagesStorageKey } from './generated-paths.mts'
import { putSitemapObjectFile } from './storage.mts'
import { buildSitemapUrl } from './url-builder.mts'
import { iterateUrlsetXml } from './xml-builder.mts'

/**
 * Static pages included in the sitemap (paths relative to site root).
 * Add new public pages here.
 */
export const STATIC_PAGE_PATHS = [
  '/',
  '/news',
  '/stories',
  '/plans',
  '/articles',
  '/blog',
  '/channels',
  '/communities',
  '/topics',
  '/cards',
  '/domains',
  '/domains/compare',
  '/news-sources',
  '/podcast-episodes',
  '/podcasts',
  '/sources',
  '/videos',
  '/web-search',
  '/reviews',
  '/discussions',
  '/posts',
  '/data-points',
  '/referral-programs',
  '/rewards-programs',
  '/spending-categories',
  '/rewards-program-statuses',
] as const

export function buildStaticPageUrlEntries(now: string = new Date().toISOString()) {
  return STATIC_PAGE_PATHS.map(path => ({
    loc: buildSitemapUrl(path),
    lastmod: now,
  }))
}

type GenerateStaticPagesSitemapDeps = {
  putSitemapObjectFile: typeof putSitemapObjectFile
}

const defaultDeps: GenerateStaticPagesSitemapDeps = {
  putSitemapObjectFile,
}

export async function generateStaticPagesSitemap(
  deps: GenerateStaticPagesSitemapDeps = defaultDeps,
): Promise<void> {
  const urls = buildStaticPageUrlEntries()

  const file = await createGzipFileFromUtf8Chunks(iterateUrlsetXml(urls))

  try {
    await deps.putSitemapObjectFile(buildStaticPagesStorageKey(), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await deleteTemporaryGzipFile(file.filePath)
  }
}
