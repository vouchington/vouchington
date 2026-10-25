import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { readPostsForDayPage } from './daily-queries.mts'
import { generateSitemapPage, type GenerationPageResult } from './generation-page.mts'
import {
  buildPostDayIndexStorageKey,
  buildPostDayPageRoutePath,
  buildPostDayPageStorageKey,
  buildPostsIndexStorageKey,
  buildTypeIndexRoutePath,
} from './generated-paths.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import {
  deletePostDayProgress,
  getPostDayProgress,
  putPostDayProgress,
  putRetiredSitemapGeneration,
} from './generation-storage.mts'
import { getPostDayManifest, markTrackedDay, putSitemapObjectFile } from './storage.mts'
import { buildPostSitemapUrl, buildSitemapUrl } from './url-builder.mts'
import { iterateSitemapIndexXml } from './xml-builder.mts'
import { getSitemapsWorkLimit } from './work-limits.mts'
import type { SitemapPostType, SitemapPostWithId } from './types.mts'
export { generatePostTypeIndex, generateRootIndex } from './index-generation.mts'

export async function generatePostDaySitemapFiles(
  postType: SitemapPostType,
  day: string,
): Promise<GenerationPageResult> {
  return generateSitemapPage<SitemapPostWithId>(getSitemapsWorkLimit('generation_page_row_limit'), {
    getProgress: () => getPostDayProgress(postType, day),
    getManifest: () => getPostDayManifest(postType, day),
    putProgress: progress => putPostDayProgress(postType, day, progress),
    deleteProgress: () => deletePostDayProgress(postType, day),
    readPage: options => readPostsForDayPage(postType, day, options),
    pageStorageKey: (generationId, page) =>
      buildPostDayPageStorageKey(postType, day, generationId, page),
    pageRoutePath: (generationId, page) =>
      buildPostDayPageRoutePath(postType, day, generationId, page),
    indexStorageKey: buildPostDayIndexStorageKey(postType, day),
    retireGeneration: (generationId, pageCount) =>
      putRetiredSitemapGeneration({
        generation_id: generationId,
        page_prefix: buildPostDayPageStorageKey(postType, day, generationId, 1).replace(
          /1\.xml$/,
          '',
        ),
        page_count: pageCount,
        next_page: 1,
        retire_after: new Date(
          Date.now() + getSitemapsWorkLimit('retired_generation_grace_seconds') * 1000,
        ).toISOString(),
      }),
    afterPublication: async () => {
      await markTrackedDay(day)
    },
    toUrl: buildPostSitemapUrl,
  })
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
