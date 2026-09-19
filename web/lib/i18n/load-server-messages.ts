import 'server-only'

import { headers } from 'next/headers'
import type { EnCatalog } from '@ts-shared/ui-messages'
import type { LocalizationBatch } from '@vouchington/localization'
import { getWebLocalizationBatch } from '@/lib/api/server/localization'
import { catalogFromLocalizationBatch } from './catalog-from-batch'
import { webLocalizationSearchParams } from './localization-query'
import { webSelectorsForPath } from './localization-selectors'
import { ssrLocalizationRevisionProps } from './ssr-localization-revision-props.mts'

const REFRESH_RETRY_DELAY_MS = 60_000

type LoadingCatalog = {
  state: 'loading'
  promise: Promise<EnCatalog>
}

type ResolvedCatalog = {
  state: 'resolved'
  batch: LocalizationBatch
  catalog: EnCatalog
  expiresAt: number
  refresh?: Promise<void>
  retryAt: number
}

type CatalogEntry = LoadingCatalog | ResolvedCatalog

const catalogs = new Map<string, CatalogEntry>()
const catalogRevisions = new WeakMap<EnCatalog, string>()

function expiresAt(batch: LocalizationBatch): number {
  const ttlMilliseconds = Number.isFinite(batch.ttlSeconds)
    ? Math.max(0, batch.ttlSeconds * 1000)
    : 0
  return Date.now() + ttlMilliseconds
}

function resolvedCatalog(batch: LocalizationBatch): ResolvedCatalog {
  const catalog = catalogFromLocalizationBatch(batch)
  catalogRevisions.set(catalog, batch.revision)
  return {
    state: 'resolved',
    batch,
    catalog,
    expiresAt: expiresAt(batch),
    retryAt: 0,
  }
}

function loadInitialCatalog(
  cacheKey: string,
  locale: string,
  pathname: string,
): Promise<EnCatalog> {
  const promise = getWebLocalizationBatch(locale, webSelectorsForPath(pathname).join(',')).then(
    batch => {
      const entry = resolvedCatalog(batch)
      const current = catalogs.get(cacheKey)
      if (current?.state === 'loading' && current.promise === promise) {
        catalogs.set(cacheKey, entry)
      }
      return entry.catalog
    },
    error => {
      const current = catalogs.get(cacheKey)
      if (current?.state === 'loading' && current.promise === promise) {
        catalogs.delete(cacheKey)
      }
      throw error
    },
  )
  catalogs.set(cacheKey, { state: 'loading', promise })
  return promise
}

function refreshCatalog(
  cacheKey: string,
  entry: ResolvedCatalog,
  locale: string,
  pathname: string,
): void {
  if (entry.refresh || Date.now() < entry.retryAt) return

  const refresh = getWebLocalizationBatch(locale, webSelectorsForPath(pathname).join(','))
    .then(batch => {
      if (catalogs.get(cacheKey) !== entry) return undefined
      const refreshed = resolvedCatalog(batch)
      entry.batch = refreshed.batch
      entry.catalog = refreshed.catalog
      entry.expiresAt = refreshed.expiresAt
      entry.retryAt = 0
      return undefined
    })
    .catch(() => {
      if (catalogs.get(cacheKey) === entry) {
        entry.retryAt = Date.now() + REFRESH_RETRY_DELAY_MS
      }
    })
    .finally(() => {
      if (entry.refresh === refresh) entry.refresh = undefined
    })
  entry.refresh = refresh
}

function localizationCacheKey(locale: string, pathname: string): string {
  const params = webLocalizationSearchParams(locale, webSelectorsForPath(pathname))
  return `${params.locales}:${params.selectors}`
}

async function localizationPathname(): Promise<string> {
  return (await headers()).get('x-pathname') ?? ''
}

/** Every live SSR render fetches route copy from the backend; the TTL cache avoids repeat work. */
export async function loadServerMessages(locale: string): Promise<EnCatalog> {
  const pathname = await localizationPathname()
  const cacheKey = localizationCacheKey(locale, pathname)
  const entry = catalogs.get(cacheKey)
  if (!entry) {
    return loadInitialCatalog(cacheKey, locale, pathname)
  }
  if (entry.state === 'loading') return entry.promise
  if (Date.now() >= entry.expiresAt) {
    refreshCatalog(cacheKey, entry, locale, pathname)
  }
  return entry.catalog
}

/** Catalog revision for the same pathname-keyed entry `loadServerMessages` just resolved. */
export async function loadedServerLocalizationRevision(
  locale: string,
): Promise<string | undefined> {
  const pathname = await localizationPathname()
  const entry = catalogs.get(localizationCacheKey(locale, pathname))
  return entry?.state === 'resolved' ? entry.batch.revision : undefined
}

/** Development-only `<html>` marker bound to the catalog object this render serialized. */
export function ssrLocalizationRevisionHtmlProps(
  catalog: EnCatalog,
): ReturnType<typeof ssrLocalizationRevisionProps> {
  if (process.env.NODE_ENV !== 'development') return {}
  return ssrLocalizationRevisionProps(process.env.NODE_ENV, catalogRevisions.get(catalog))
}
