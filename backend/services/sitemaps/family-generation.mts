import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { iterateSitemapFamilyEntries } from './family-queries.mts'
import {
  buildFamilyIndexRoutePath,
  buildFamilyIndexStorageKey,
  buildFamilyPageRoutePath,
  buildFamilyPageStorageKey,
} from './generated-paths.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import {
  getSitemapFamilyManifest,
  putSitemapFamilyManifest,
  putSitemapObjectFile,
  type SitemapFamilyManifest,
} from './storage.mts'
import { buildFamilySitemapUrl, buildSitemapUrl } from './url-builder.mts'
import { buildUrlEntryXml, iterateSitemapIndexXml, iterateUrlsetXml } from './xml-builder.mts'
import type { SitemapFamilyEntry, SitemapFamilyType } from './types.mts'

type GenerateSitemapFamilyFilesDependencies = {
  getSitemapFamilyManifest: typeof getSitemapFamilyManifest
  iterateSitemapFamilyEntries: typeof iterateSitemapFamilyEntries
  putSitemapFamilyManifest: typeof putSitemapFamilyManifest
  putSitemapObjectFile: typeof putSitemapObjectFile
}

const defaultGenerateSitemapFamilyFilesDependencies: GenerateSitemapFamilyFilesDependencies = {
  getSitemapFamilyManifest,
  iterateSitemapFamilyEntries,
  putSitemapFamilyManifest,
  putSitemapObjectFile,
}

export async function generateSitemapFamilyFiles(
  family: SitemapFamilyType,
  dependencies = defaultGenerateSitemapFamilyFilesDependencies,
): Promise<SitemapFamilyManifest> {
  const previousManifest = await dependencies.getSitemapFamilyManifest(family)
  const previousHashes = previousManifest?.content_hashes ?? {}
  const nextHashes: Record<string, string> = {}
  const entries = dependencies.iterateSitemapFamilyEntries(family)
  const entryIterator = entries[Symbol.asyncIterator]() as AsyncIterableIterator<SitemapFamilyEntry>
  let activePageCount = 0

  for await (const entry of entryIterator) {
    activePageCount += 1
    const fileName = `${activePageCount}.xml`
    const { filePath, contentHash } = await createGzipFileFromUtf8Chunks(
      iterateFamilyPageXml(entry, entryIterator),
    )
    try {
      nextHashes[fileName] = contentHash
      if (previousHashes[fileName] === contentHash) continue
      await dependencies.putSitemapObjectFile(
        buildFamilyPageStorageKey(family, activePageCount),
        filePath,
        {
          contentType: 'application/xml; charset=utf-8',
          contentEncoding: 'gzip',
        },
      )
    } finally {
      await deleteTemporaryGzipFile(filePath)
    }
  }

  const highestPageToRewrite = Math.max(
    previousManifest?.highest_written_page ?? 0,
    activePageCount,
  )
  for (let page = activePageCount + 1; page <= highestPageToRewrite; page++) {
    const fileName = `${page}.xml`
    // oxlint-disable-next-line no-await-in-loop -- stale pages are rewritten in publication order before the index
    const { filePath, contentHash } = await createGzipFileFromUtf8Chunks(iterateUrlsetXml([]))
    try {
      nextHashes[fileName] = contentHash
      if (previousHashes[fileName] === contentHash) continue
      // oxlint-disable-next-line no-await-in-loop -- stale page publication order must precede the index update
      await dependencies.putSitemapObjectFile(buildFamilyPageStorageKey(family, page), filePath, {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
      })
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- clean each temporary page before creating the next one
      await deleteTemporaryGzipFile(filePath)
    }
  }

  const indexFile = await createGzipFileFromUtf8Chunks(
    iterateSitemapIndexXml(iterateFamilyPageEntries(family, activePageCount)),
  )
  try {
    nextHashes['index.xml'] = indexFile.contentHash
    if (previousHashes['index.xml'] !== indexFile.contentHash) {
      await dependencies.putSitemapObjectFile(
        buildFamilyIndexStorageKey(family),
        indexFile.filePath,
        {
          contentType: 'application/xml; charset=utf-8',
          contentEncoding: 'gzip',
        },
      )
    }
  } finally {
    await deleteTemporaryGzipFile(indexFile.filePath)
  }

  const manifest: SitemapFamilyManifest = {
    active_page_count: activePageCount,
    highest_written_page: highestPageToRewrite,
    generated_at: new Date().toISOString(),
    content_hashes: nextHashes,
  }
  await dependencies.putSitemapFamilyManifest(family, manifest)
  return manifest
}

function* iterateFamilyPageEntries(
  family: SitemapFamilyType,
  activePageCount: number,
): Iterable<{ loc: string }> {
  for (let page = 1; page <= activePageCount; page++) {
    yield {
      loc: buildSitemapUrl(buildFamilyPageRoutePath(family, page)),
    }
  }
}

async function* iterateFamilyPageXml(
  firstEntry: SitemapFamilyEntry,
  entryIterator: AsyncIterator<SitemapFamilyEntry>,
): AsyncIterable<string> {
  yield '<?xml version="1.0" encoding="UTF-8"?>'
  yield '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'

  yield buildUrlEntryXml(buildFamilySitemapUrl(firstEntry))

  for (let count = 1; count < SITEMAP_CONFIG.MAX_URLS_PER_SITEMAP; count++) {
    // oxlint-disable-next-line no-await-in-loop -- each read advances the same cursor used by the outer page iterator
    const nextEntry = await entryIterator.next()
    if (nextEntry.done) break
    yield buildUrlEntryXml(buildFamilySitemapUrl(nextEntry.value))
  }

  yield '</urlset>'
}

export function buildSitemapFamilyIndexEntry(family: SitemapFamilyType): { loc: string } {
  return {
    loc: buildSitemapUrl(buildFamilyIndexRoutePath(family)),
  }
}
