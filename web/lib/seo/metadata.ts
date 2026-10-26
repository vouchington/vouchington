import type { Metadata } from 'next'
import {
  createRootMetadata as rootMetadata,
  createPageMetadata as pageMetadata,
  createNoIndexMetadata as noIndexMetadata,
} from '@vouchington/utils/seo-metadata'
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, buildAbsoluteUrl } from './constants'
import { toOpenGraphLocale } from '@ts-shared/languages/open-graph'
import { getMarkdownAlternatePath } from './markdown-alternates'
import { buildGenericOgImageUrl } from './og-image-url'

const site = { siteName: SITE_NAME, origin: SITE_ORIGIN, description: SITE_DESCRIPTION }

function createGenericOgImageUrl(): string {
  return buildAbsoluteUrl(
    buildGenericOgImageUrl({
      eyebrow: 'Community Intelligence',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      domainLabel: 'voucha.ai',
    }),
  )
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
  return rootMetadata(site, {
    imageUrl: createGenericOgImageUrl(),
    openGraphLocale: toOpenGraphLocale('en'),
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  })
}

export function createPageMetadata({
  imagePath,
  contentLanguage,
  ...options
}: PageMetadataOptions): Metadata {
  return pageMetadata(site, {
    ...options,
    imageUrl:
      imagePath === null ? null : imagePath === undefined ? undefined : buildAbsoluteUrl(imagePath),
    fallbackImageUrl: imagePath === undefined ? createGenericOgImageUrl() : undefined,
    openGraphLocale: toOpenGraphLocale(contentLanguage ?? 'en'),
    markdownAlternatePath: getMarkdownAlternatePath(options.path ?? '/'),
  })
}

export function createNoIndexMetadata(title?: string): Metadata {
  return noIndexMetadata(site, title)
}
