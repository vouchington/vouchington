import { parseUtcDay } from '@ts-shared/utils/dates'
import type { SitemapFamilyType, SitemapPostType } from './types.mts'

export function buildPostsIndexRoutePath(): string {
  return 'sitemaps/posts.xml'
}

export function buildTypeIndexRoutePath(postType: SitemapPostType): string {
  return `sitemaps/${postType}.xml`
}

export function buildPostDayIndexRoutePath(postType: SitemapPostType, day: string): string {
  return `sitemaps/${postType}/${day}/index.xml`
}

export function buildPostDayPageRoutePath(
  postType: SitemapPostType,
  day: string,
  generationId: string,
  page: number,
): string {
  return `sitemaps/${postType}/${day}/${generationId}/${page}.xml`
}

export function buildStaticPagesRoutePath(): string {
  return 'sitemaps/static.xml'
}

export function buildFamilyIndexRoutePath(family: SitemapFamilyType): string {
  return `sitemaps/${family}.xml`
}

export function buildFamilyPageRoutePath(
  family: SitemapFamilyType,
  generationId: string,
  page: number,
): string {
  return `sitemaps/${family}/${generationId}/${page}.xml`
}

export function buildRootSitemapStorageKey(): string {
  return 'sitemaps/root.xml'
}

export function buildStaticPagesStorageKey(): string {
  return 'sitemaps/static.xml'
}

export function buildPostsIndexStorageKey(): string {
  return 'sitemaps/posts.xml'
}

export function buildFamilyIndexStorageKey(family: SitemapFamilyType): string {
  return `sitemaps/families/${family}.xml`
}

export function buildFamilyPageStorageKey(
  family: SitemapFamilyType,
  generationId: string,
  page: number,
): string {
  return `families/${family}/${generationId}/${page}.xml`
}

export function buildFamilyProgressStorageKey(family: SitemapFamilyType): string {
  return `families/${family}/_progress.json`
}

export function buildFamilyMetaStorageKey(family: SitemapFamilyType): string {
  return `families/${family}/_meta.json`
}

export function buildTypeIndexStorageKey(postType: SitemapPostType): string {
  return `sitemaps/types/${postType}.xml`
}

export function buildPostDayIndexStorageKey(postType: SitemapPostType, day: string): string {
  const parts = parseUtcDay(day)
  return `posts/${parts.year}/${parts.month}/${parts.day}/${postType}/index.xml`
}

export function buildPostDayPageStorageKey(
  postType: SitemapPostType,
  day: string,
  generationId: string,
  page: number,
): string {
  const parts = parseUtcDay(day)
  return `posts/${parts.year}/${parts.month}/${parts.day}/${postType}/${generationId}/${page}.xml`
}

export function buildPostDayProgressStorageKey(postType: SitemapPostType, day: string): string {
  const parts = parseUtcDay(day)
  return `posts/${parts.year}/${parts.month}/${parts.day}/${postType}/_progress.json`
}

export function buildPostDayMetaStorageKey(postType: SitemapPostType, day: string): string {
  const parts = parseUtcDay(day)
  return `posts/${parts.year}/${parts.month}/${parts.day}/${postType}/_meta.json`
}
