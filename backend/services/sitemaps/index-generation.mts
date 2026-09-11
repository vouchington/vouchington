import { enumerateUtcDaysInclusive } from '@ts-shared/utils/dates'
import { buildRootSitemapStorageKey, buildTypeIndexStorageKey } from './generated-paths.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import { buildPostTypeIndexEntries, buildRootIndexEntries } from './index-entries.mts'
import { generateStaticPagesSitemap } from './static-pages.mts'
import { getTrackedDayRange, putSitemapObjectFile } from './storage.mts'
import { iterateSitemapIndexXml } from './xml-builder.mts'
import type { SitemapPostType } from './types.mts'

export const indexGenerationDependencies = {
  buildPostTypeIndexEntries,
  buildRootIndexEntries,
  createGzipFileFromUtf8Chunks,
  deleteTemporaryGzipFile,
  generateStaticPagesSitemap,
  getTrackedDayRange,
  putSitemapObjectFile,
}

export async function generatePostTypeIndex(
  postType: SitemapPostType,
  dependencies = indexGenerationDependencies,
): Promise<void> {
  const trackedRange = await dependencies.getTrackedDayRange()
  const days = trackedRange
    ? enumerateUtcDaysInclusive(trackedRange.earliestDay, trackedRange.latestDay)
    : []
  const entries = await dependencies.buildPostTypeIndexEntries(postType, days)
  const file = await dependencies.createGzipFileFromUtf8Chunks(iterateSitemapIndexXml(entries))
  try {
    await dependencies.putSitemapObjectFile(buildTypeIndexStorageKey(postType), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await dependencies.deleteTemporaryGzipFile(file.filePath)
  }
}

export async function generateRootIndex(dependencies = indexGenerationDependencies): Promise<void> {
  const [, entries] = await Promise.all([
    dependencies.generateStaticPagesSitemap(),
    dependencies.buildRootIndexEntries(),
  ])
  await writeRootIndexFile(entries, dependencies)
}

async function writeRootIndexFile(
  entries: Array<{ loc: string }>,
  dependencies: typeof indexGenerationDependencies,
): Promise<void> {
  const file = await dependencies.createGzipFileFromUtf8Chunks(iterateSitemapIndexXml(entries))
  try {
    await dependencies.putSitemapObjectFile(buildRootSitemapStorageKey(), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await dependencies.deleteTemporaryGzipFile(file.filePath)
  }
}
