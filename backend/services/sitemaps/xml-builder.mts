import { escapeHtml } from '@ts-shared/utils/html'
import type { SitemapUrl } from './types.mts'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'
const SITEMAP_INDEX_OPEN = '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
const SITEMAP_INDEX_CLOSE = '</sitemapindex>'
const URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
const URLSET_CLOSE = '</urlset>'

function buildSitemapIndexEntryXml(sitemap: { loc: string }): string {
  return `<sitemap><loc>${escapeHtml(sitemap.loc)}</loc></sitemap>`
}

export function buildUrlEntryXml(url: SitemapUrl): string {
  return `<url><loc>${escapeHtml(url.loc)}</loc><lastmod>${url.lastmod}</lastmod></url>`
}

export function* iterateSitemapIndexXml(sitemaps: Iterable<{ loc: string }>): Iterable<string> {
  yield XML_DECLARATION
  yield SITEMAP_INDEX_OPEN

  for (const sitemap of sitemaps) {
    yield buildSitemapIndexEntryXml(sitemap)
  }

  yield SITEMAP_INDEX_CLOSE
}

export function buildSitemapIndex(sitemaps: Iterable<{ loc: string }>): string {
  let xml = XML_DECLARATION + SITEMAP_INDEX_OPEN

  for (const sitemap of sitemaps) {
    xml += buildSitemapIndexEntryXml(sitemap)
  }

  return xml + SITEMAP_INDEX_CLOSE
}

export function* iterateUrlsetXml(urls: Iterable<SitemapUrl>): Iterable<string> {
  yield XML_DECLARATION
  yield URLSET_OPEN

  for (const url of urls) {
    yield buildUrlEntryXml(url)
  }

  yield URLSET_CLOSE
}

export function buildUrlset(urls: Iterable<SitemapUrl>): string {
  let xml = XML_DECLARATION + URLSET_OPEN

  for (const url of urls) {
    xml += buildUrlEntryXml(url)
  }

  return xml + URLSET_CLOSE
}
