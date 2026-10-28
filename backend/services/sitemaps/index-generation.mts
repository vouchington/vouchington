import { enumerateUtcDaysInclusive } from '@ts-shared/utils/dates'
import { buildRootSitemapStorageKey, buildTypeIndexStorageKey } from './generated-paths.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import { buildPostTypeIndexEntries, buildRootIndexEntries } from './index-entries.mts'
import { generateStaticPagesSitemap } from './static-pages.mts'
import { getTrackedDayRange, putSitemapObjectFile } from './storage.mts'
import { iterateSitemapIndexXml } from './xml-builder.mts'
import type { SitemapPostType } from './types.mts'

export async function generatePostTypeIndex(postType: SitemapPostType): Promise<void> {
  const trackedRange = await getTrackedDayRange()
  const days = trackedRange
    ? enumerateUtcDaysInclusive(trackedRange.earliestDay, trackedRange.latestDay)
    : []
  const entries = await buildPostTypeIndexEntries(postType, days)
  const file = await createGzipFileFromUtf8Chunks(iterateSitemapIndexXml(entries))
  try {
    await putSitemapObjectFile(buildTypeIndexStorageKey(postType), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await deleteTemporaryGzipFile(file.filePath)
  }
}

export async function generateRootIndex(): Promise<void> {
  const [, entries] = await Promise.all([generateStaticPagesSitemap(), buildRootIndexEntries()])
  await writeRootIndexFile(entries)
}

async function writeRootIndexFile(entries: Array<{ loc: string }>): Promise<void> {
  const file = await createGzipFileFromUtf8Chunks(iterateSitemapIndexXml(entries))
  try {
    await putSitemapObjectFile(buildRootSitemapStorageKey(), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await deleteTemporaryGzipFile(file.filePath)
  }
}
