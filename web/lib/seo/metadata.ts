import type { Metadata } from 'next'
import {
  createNoIndexMetadata as createSharedNoIndexMetadata,
  createPageMetadata as createSharedPageMetadata,
  createRootMetadata as createSharedRootMetadata,
  type PageMetadataOptions,
} from '@vouchington/utils/seo-metadata'
import { toOpenGraphLocale } from '@ts-shared/languages/open-graph'
import { SITE_DESCRIPTION, SITE_NAME, buildAbsoluteUrl } from './constants'
import { getMarkdownAlternatePath } from './markdown-alternates'
import { buildGenericOgImageUrl } from './og-image-url'

function site() {
  return { siteName: SITE_NAME, origin: buildAbsoluteUrl('/'), description: SITE_DESCRIPTION }
}

function genericImageUrl(): string {
  return buildAbsoluteUrl(
    buildGenericOgImageUrl({
      eyebrow: 'Community Intelligence',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      domainLabel: 'voucha.ai',
    }),
  )
}

export function createRootMetadata(): Metadata {
  return createSharedRootMetadata(site(), {
    imageUrl: genericImageUrl(),
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

interface VouchaPageMetadataOptions extends Omit<
  PageMetadataOptions,
  'imageUrl' | 'fallbackImageUrl' | 'openGraphLocale' | 'markdownAlternatePath'
> {
  imagePath?: string | null
  contentLanguage?: string | null
}

export function createPageMetadata(options: VouchaPageMetadataOptions): Metadata {
  return createSharedPageMetadata(site(), {
    ...options,
    imageUrl:
      options.imagePath === null
        ? null
        : options.imagePath
          ? buildAbsoluteUrl(options.imagePath)
          : undefined,
    fallbackImageUrl: genericImageUrl(),
    openGraphLocale: toOpenGraphLocale(options.contentLanguage ?? 'en'),
    markdownAlternatePath: getMarkdownAlternatePath(options.path ?? '/'),
  })
}

export function createNoIndexMetadata(title?: string): Metadata {
  return createSharedNoIndexMetadata(site(), title)
}
