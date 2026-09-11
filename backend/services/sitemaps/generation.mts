import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { iteratePostsForDay } from './daily-queries.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import {
  buildPostDayIndexStorageKey,
  buildPostDayPageRoutePath,
  buildPostDayPageStorageKey,
  buildPostsIndexStorageKey,
  buildTypeIndexRoutePath,
} from './generated-paths.mts'
import {
  getPostDayManifest,
  markTrackedDay,
  putPostDayManifest,
  putSitemapObjectFile,
  type PostDayManifest,
} from './storage.mts'
import { buildPostSitemapUrl, buildSitemapUrl } from './url-builder.mts'
import { buildUrlEntryXml, iterateSitemapIndexXml, iterateUrlsetXml } from './xml-builder.mts'
import type { SitemapPostType, SitemapPostWithId } from './types.mts'
export {
  generatePostTypeIndex,
  generateRootIndex,
  indexGenerationDependencies,
} from './index-generation.mts'

export async function generatePostDaySitemapFiles(
  postType: SitemapPostType,
  day: string,
): Promise<PostDayManifest> {
  const previousManifest = await getPostDayManifest(postType, day)
  const nextHashes: Record<string, string> = {}
  const previousHashes = previousManifest?.content_hashes ?? {}
  const posts = iteratePostsForDay(postType, day)
  const postIterator = posts[Symbol.asyncIterator]() as AsyncIterableIterator<SitemapPostWithId>
  let activePageCount = 0
  for await (const post of postIterator) {
    activePageCount += 1
    const fileName = `${activePageCount}.xml`
    const { filePath, contentHash } = await createGzipFileFromUtf8Chunks(
      iteratePostDayPageXml(post, postIterator),
    )
    try {
      nextHashes[fileName] = contentHash
      if (previousHashes[fileName] === contentHash) {
        continue
      }
      await putSitemapObjectFile(
        buildPostDayPageStorageKey(postType, day, activePageCount),
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
    // oxlint-disable-next-line no-await-in-loop -- stale pages are rewritten in publication order before the day index
    const { filePath, contentHash } = await createGzipFileFromUtf8Chunks(iterateUrlsetXml([]))
    try {
      if (previousHashes[fileName] === contentHash) {
        continue
      }
      // oxlint-disable-next-line no-await-in-loop -- stale page publication order must precede the day index update
      await putSitemapObjectFile(buildPostDayPageStorageKey(postType, day, page), filePath, {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
      })
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- clean each temporary page before creating the next one
      await deleteTemporaryGzipFile(filePath)
    }
  }
  const dayIndexFile = await createGzipFileFromUtf8Chunks(
    iterateSitemapIndexXml(iteratePostDayPageEntries(postType, day, activePageCount)),
  )
  try {
    nextHashes['index.xml'] = dayIndexFile.contentHash
    if (previousHashes['index.xml'] !== dayIndexFile.contentHash) {
      await putSitemapObjectFile(
        buildPostDayIndexStorageKey(postType, day),
        dayIndexFile.filePath,
        {
          contentType: 'application/xml; charset=utf-8',
          contentEncoding: 'gzip',
        },
      )
    }
  } finally {
    await deleteTemporaryGzipFile(dayIndexFile.filePath)
  }
  const manifest: PostDayManifest = {
    active_page_count: activePageCount,
    highest_written_page: activePageCount,
    generated_at: new Date().toISOString(),
    content_hashes: nextHashes,
  }
  await putPostDayManifest(postType, day, manifest)
  await markTrackedDay(day)
  return manifest
}
export async function generatePostsIndex(): Promise<void> {
  const entries = SITEMAP_CONFIG.POST_TYPES.map(postType => ({
    loc: buildSitemapUrl(buildTypeIndexRoutePath(postType)),
  }))
  const file = await createGzipFileFromUtf8Chunks(iterateSitemapIndexXml(entries))
  try {
    await putSitemapObjectFile(buildPostsIndexStorageKey(), file.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
    })
  } finally {
    await deleteTemporaryGzipFile(file.filePath)
  }
}
function* iteratePostDayPageEntries(
  postType: SitemapPostType,
  day: string,
  activePageCount: number,
): Iterable<{ loc: string }> {
  for (let page = 1; page <= activePageCount; page++) {
    yield {
      loc: buildSitemapUrl(buildPostDayPageRoutePath(postType, day, page)),
    }
  }
}

async function* iteratePostDayPageXml(
  firstPost: SitemapPostWithId,
  postIterator: AsyncIterator<SitemapPostWithId>,
): AsyncIterable<string> {
  yield '<?xml version="1.0" encoding="UTF-8"?>'
  yield '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'

  yield buildUrlEntryXml(buildPostSitemapUrl(firstPost))

  for (let count = 1; count < SITEMAP_CONFIG.MAX_URLS_PER_SITEMAP; count++) {
    // oxlint-disable-next-line no-await-in-loop -- each read advances the same post cursor used by the outer page iterator
    const nextPost = await postIterator.next()
    if (nextPost.done) {
      break
    }
    yield buildUrlEntryXml(buildPostSitemapUrl(nextPost.value))
  }

  yield '</urlset>'
}
