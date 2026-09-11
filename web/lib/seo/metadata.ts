import type { Metadata } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, buildAbsoluteUrl, getMetadataBase } from './constants'
import { toOpenGraphLocale } from '@ts-shared/languages/open-graph'
import { getMarkdownAlternatePath } from './markdown-alternates'
import { buildGenericOgImageUrl } from './og-image-url'

const GENERIC_OG_IMAGE_PARAMS = {
  eyebrow: 'Community Intelligence',
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  domainLabel: 'voucha.ai',
}

function createGenericOgImageUrl(): string {
  return buildAbsoluteUrl(buildGenericOgImageUrl(GENERIC_OG_IMAGE_PARAMS))
}

interface PageMetadataOptions {
  title?: string
  description?: string
  path?: string
  noIndex?: boolean
  /** Pass `null` to omit OG/Twitter images entirely; omit to use the site-wide generic card */
  imagePath?: string | null
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  authors?: string[]
  rssUrl?: string
  /** ISO 639-1 or BCP-47 content locale (e.g. 'en', 'en-US'). Defaults to 'en'. */
  contentLanguage?: string | null
}

export function createRootMetadata(): Metadata {
  const openGraphLocale = toOpenGraphLocale('en')
  const ogImageUrl = createGenericOgImageUrl()

  return {
    metadataBase: getMetadataBase(),
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    alternates: {
      canonical: '/',
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      ...(openGraphLocale ? { locale: openGraphLocale } : {}),
      url: buildAbsoluteUrl('/'),
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [ogImageUrl],
    },
  }
}

export function createPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = '/',
  noIndex = false,
  imagePath,
  type = 'website',
  publishedTime,
  modifiedTime,
  authors,
  rssUrl,
  contentLanguage,
}: PageMetadataOptions): Metadata {
  // null = omit explicit OG/Twitter images entirely; undefined = fall back to the
  // site-wide generic card so every page has one without passing it explicitly.
  const ogImageUrl =
    imagePath !== null ? buildAbsoluteUrl(imagePath ?? createGenericOgImageUrl()) : undefined
  const openGraphLocale = toOpenGraphLocale(contentLanguage ?? 'en')
  const markdownAlternatePath = noIndex ? null : getMarkdownAlternatePath(path)
  const alternateTypes = {
    ...(markdownAlternatePath
      ? {
          'text/markdown': [
            { url: markdownAlternatePath, title: `${title ?? SITE_NAME} Markdown` },
          ],
        }
      : {}),
    ...(rssUrl ? { 'application/rss+xml': rssUrl } : {}),
  }

  return {
    metadataBase: getMetadataBase(),
    ...(title ? { title } : {}),
    description,
    alternates: {
      canonical: path,
      ...(Object.keys(alternateTypes).length > 0 ? { types: alternateTypes } : {}),
    },
    robots: createRobots(noIndex),
    openGraph: {
      type,
      siteName: SITE_NAME,
      ...(title ? { title } : {}),
      description,
      ...(openGraphLocale ? { locale: openGraphLocale } : {}),
      url: buildAbsoluteUrl(path),
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
      ...(type === 'article'
        ? createArticleOpenGraphMetadata({
            publishedTime,
            modifiedTime,
            authors,
          })
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      ...(title ? { title } : {}),
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  }
}

export function createNoIndexMetadata(title?: string): Metadata {
  return {
    metadataBase: getMetadataBase(),
    ...(title ? { title } : {}),
    description: SITE_DESCRIPTION,
    robots: createRobots(true),
  }
}

export function createExcerpt(value: string, maxLength: number = 160): string {
  const plainText = stripMarkup(value)
  if (plainText.length <= maxLength) return plainText

  return `${plainText.slice(0, maxLength - 1).trimEnd()}…`
}

function createRobots(noIndex: boolean): Metadata['robots'] {
  if (!noIndex) return undefined

  return {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  }
}

function createArticleOpenGraphMetadata({
  publishedTime,
  modifiedTime,
  authors,
}: Pick<PageMetadataOptions, 'publishedTime' | 'modifiedTime' | 'authors'>) {
  return {
    ...(publishedTime ? { publishedTime } : {}),
    ...(modifiedTime ? { modifiedTime } : {}),
    ...(authors?.length ? { authors } : {}),
  }
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>[\]()+!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
