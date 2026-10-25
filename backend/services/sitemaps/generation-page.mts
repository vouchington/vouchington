import { createHash, randomUUID } from 'node:crypto'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { SitemapUrl } from './types.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import { putSitemapObjectFile, type PostDayManifest } from './storage.mts'
import { buildSitemapUrl } from './url-builder.mts'
import { iterateSitemapIndexXml, iterateUrlsetXml } from './xml-builder.mts'
import { getSitemapsWorkLimit } from './work-limits.mts'

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
  now = new Date(),
): Promise<GenerationPageResult> {
  let progress = await dependencies.getProgress()
  const publishedManifest = await dependencies.getManifest()
  const ageMs = progress ? now.getTime() - Date.parse(progress.started_at) : 0
  if (
    progress &&
    (!Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs >= getSitemapsWorkLimit('generation_max_age_seconds') * 1000)
  ) {
    if (publishedManifest?.generation_id !== progress.generation_id) {
      // A lost upload acknowledgement can leave one child beyond the saved page count.
      await dependencies.retireGeneration(
        progress.generation_id,
        Math.min(
          SITEMAP_CONFIG.MAX_URLS_PER_SITEMAP,
          progress.page_count + (progress.finished ? 0 : 1),
        ),
      )
    } else if (progress.previous_generation_id) {
      await dependencies.retireGeneration(
        progress.previous_generation_id,
        progress.previous_page_count,
      )
    }
    progress = null
  }
  if (!progress) {
    const previousManifest = publishedManifest
    progress = {
      generation_id: randomUUID(),
      started_at: now.toISOString(),
      content_hash: '',
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
      const contentHash = createHash('sha256')
        .update(progress.content_hash)
        .update(file.contentHash)
        .digest('hex')
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
        content_hash: contentHash,
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

  if (
    publishedManifest &&
    publishedManifest.generation_id !== progress.generation_id &&
    publishedManifest.active_page_count === progress.page_count &&
    publishedManifest.content_hash === progress.content_hash
  ) {
    await dependencies.retireGeneration(progress.generation_id, progress.page_count)
    await dependencies.afterPublication?.()
    await dependencies.deleteProgress()
    return { manifest: publishedManifest, hasMore: false }
  }

  const index = await createGzipFileFromUtf8Chunks(
    iterateSitemapIndexXml(iteratePageEntries(progress, dependencies.pageRoutePath)),
  )
  const manifest: PostDayManifest = {
    active_page_count: progress.page_count,
    generation_id: progress.generation_id,
    generated_at: now.toISOString(),
    content_hash: progress.content_hash,
  }
  try {
    await (dependencies.putObjectFile ?? putSitemapObjectFile)(
      dependencies.indexStorageKey,
      index.filePath,
      {
        contentType: 'application/xml; charset=utf-8',
        contentEncoding: 'gzip',
        manifest,
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
