import { randomUUID } from 'node:crypto'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { SitemapUrl } from './types.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import { putSitemapObjectFile, type PostDayManifest } from './storage.mts'
import { buildSitemapUrl } from './url-builder.mts'
import { iterateSitemapIndexXml, iterateUrlsetXml } from './xml-builder.mts'

type SourceEntry = { id: string; path?: string }

export type GenerationPageDependencies<T extends SourceEntry> = {
  getProgress: () => Promise<SitemapGenerationProgress | null>
  getManifest: () => Promise<PostDayManifest | null>
  putProgress: (progress: SitemapGenerationProgress) => Promise<void>
  deleteProgress: () => Promise<void>
  readPage: (options: {
    highWaterId?: string
    afterId?: string
    afterPath?: string
    limit: number
  }) => Promise<T[]>
  pageStorageKey: (generationId: string, page: number) => string
  pageRoutePath: (generationId: string, page: number) => string
  indexStorageKey: string
  putManifest: (manifest: PostDayManifest) => Promise<void>
  retireGeneration: (generationId: string, pageCount: number) => Promise<void>
  afterPublication?: () => Promise<void>
  toUrl: (entry: T) => SitemapUrl
  putObjectFile?: typeof putSitemapObjectFile
}

export type GenerationPageResult = {
  manifest: PostDayManifest | null
  hasMore: boolean
  continuationId?: string
}

/** One durable, capped source page. The stable index is the final publication write. */
export async function generateSitemapPage<T extends SourceEntry>(
  maxRows: number,
  dependencies: GenerationPageDependencies<T>,
): Promise<GenerationPageResult> {
  let progress = await dependencies.getProgress()
  if (!progress) {
    const previousManifest = await dependencies.getManifest()
    progress = {
      generation_id: randomUUID(),
      high_water_id: null,
      after_id: null,
      after_path: null,
      page_count: 0,
      finished: false,
      previous_generation_id: previousManifest?.generation_id ?? null,
      previous_page_count: previousManifest?.active_page_count ?? 0,
    }
    await dependencies.putProgress(progress)
  }

  if (!progress.finished) {
    const rows = await dependencies.readPage({
      ...(progress.high_water_id ? { highWaterId: progress.high_water_id } : {}),
      ...(progress.after_id ? { afterId: progress.after_id } : {}),
      ...(progress.after_path ? { afterPath: progress.after_path } : {}),
      limit: maxRows + 1,
    })
    if (rows.length > maxRows + 1) throw new Error('Sitemap source exceeded its query limit')
    if (!progress.high_water_id && rows[0]) {
      progress = { ...progress, high_water_id: rows[0].id }
      await dependencies.putProgress(progress)
    }

    const pageRows = rows.slice(0, maxRows)
    if (pageRows.length > 0) {
      const page = progress.page_count + 1
      if (page > SITEMAP_CONFIG.MAX_URLS_PER_SITEMAP) {
        throw new Error('Sitemap index exceeds its URL count limit')
      }
      const file = await createGzipFileFromUtf8Chunks(
        iterateUrlsetXml(pageRows.map(dependencies.toUrl)),
      )
      try {
        await (dependencies.putObjectFile ?? putSitemapObjectFile)(
          dependencies.pageStorageKey(progress.generation_id, page),
          file.filePath,
          { contentType: 'application/xml; charset=utf-8', contentEncoding: 'gzip' },
        )
      } finally {
        await deleteTemporaryGzipFile(file.filePath)
      }
      const last = pageRows.at(-1)
      if (!last) throw new Error('Sitemap page lost its final row')
      progress = {
        ...progress,
        after_id: last.id,
        after_path: last.path ?? null,
        page_count: page,
        finished: rows.length <= maxRows,
      }
    } else {
      progress = { ...progress, finished: true }
    }
    await dependencies.putProgress(progress)
    if (!progress.finished) {
      return {
        manifest: null,
        hasMore: true,
        continuationId: `${progress.generation_id}-${progress.page_count + 1}`,
      }
    }
  }

  const index = await createGzipFileFromUtf8Chunks(
    iterateSitemapIndexXml(iteratePageEntries(progress, dependencies.pageRoutePath)),
  )
  const manifest: PostDayManifest = {
    active_page_count: progress.page_count,
    generation_id: progress.generation_id,
    generated_at: new Date().toISOString(),
  }
  try {
    await dependencies.putManifest(manifest)
    await (dependencies.putObjectFile ?? putSitemapObjectFile)(
      dependencies.indexStorageKey,
      index.filePath,
      {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
      },
    )
  } finally {
    await deleteTemporaryGzipFile(index.filePath)
  }
  if (progress.previous_generation_id) {
    await dependencies.retireGeneration(
      progress.previous_generation_id,
      progress.previous_page_count,
    )
  }
  await dependencies.afterPublication?.()
  await dependencies.deleteProgress()
  return { manifest, hasMore: false }
}

function* iteratePageEntries(
  progress: SitemapGenerationProgress,
  pageRoutePath: (generationId: string, page: number) => string,
): Iterable<{ loc: string }> {
  for (let page = 1; page <= progress.page_count; page++) {
    yield { loc: buildSitemapUrl(pageRoutePath(progress.generation_id, page)) }
  }
}
