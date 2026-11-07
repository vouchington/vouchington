import { createHash, randomUUID } from 'node:crypto'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { GenerationPageDependencies, SourceEntry } from './generation-page-types.mts'
import { createGzipFileFromUtf8Chunks, deleteTemporaryGzipFile } from './gzip.mts'
import type { SitemapGenerationProgress } from './generation-storage.mts'
import { putSitemapObjectFile, type PostDayManifest } from './storage.mts'
import { buildSitemapUrl } from './url-builder.mts'
import { iterateSitemapIndexXml, iterateUrlsetXml } from './xml-builder.mts'
import { getSitemapsWorkLimit } from './work-limits.mts'

export type GenerationPageResult = {
  manifest: PostDayManifest | null
  hasMore: boolean
  continuationId?: string
  generationId?: string
  /** A continuation found its generation gone or replaced; it did no work. */
  stale?: true
}

/**
 * One durable, capped source page. The stable index is the final publication write. A continuation
 * passes the generation it expects and no-ops when that generation is gone or replaced; only root
 * jobs (no expected generation) may start one.
 */
export async function generateSitemapPage<T extends SourceEntry>(
  maxRows: number,
  dependencies: GenerationPageDependencies<T>,
  expectedGenerationId?: string,
): Promise<GenerationPageResult> {
  const now = new Date()
  let progress = await dependencies.getProgress()
  const publishedManifest = await dependencies.getManifest()
  if (expectedGenerationId && progress?.generation_id !== expectedGenerationId) {
    return { manifest: publishedManifest, hasMore: false, stale: true }
  }
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
    if (expectedGenerationId) return { manifest: publishedManifest, hasMore: false, stale: true }
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
    const source = await dependencies.readPage({
      ...(progress.high_water_id ? { highWaterId: progress.high_water_id } : {}),
      ...(progress.after_id ? { afterId: progress.after_id } : {}),
      ...(progress.after_path ? { afterPath: progress.after_path } : {}),
      limit: maxRows + 1,
    })
    if (!progress.high_water_id && source.boundId) {
      progress = { ...progress, high_water_id: source.boundId }
      await dependencies.putProgress(progress)
    }

    const pageRows = source.entries
    if (pageRows.length > 0) {
      const page = progress.page_count + 1
      if (page > SITEMAP_CONFIG.MAX_URLS_PER_SITEMAP) {
        throw new Error('Sitemap index exceeds its URL count limit')
      }
      const urls = pageRows.map(dependencies.toUrl)
      const file = await createGzipFileFromUtf8Chunks(iterateUrlsetXml(urls))
      let contentHash = progress.content_hash
      for (const url of urls) {
        contentHash = createHash('sha256')
          .update(contentHash + JSON.stringify([url.loc, url.lastmod]))
          .digest('hex')
      }
      try {
        await putSitemapObjectFile(
          dependencies.pageStorageKey(progress.generation_id, page),
          file.filePath,
          { contentType: 'application/xml; charset=utf-8', contentEncoding: 'gzip' },
        )
      } finally {
        await deleteTemporaryGzipFile(file.filePath)
      }
      progress = {
        ...progress,
        after_id: source.afterId,
        after_path: source.afterPath,
        page_count: page,
        content_hash: contentHash,
        finished: source.exhausted,
      }
    } else if (!source.exhausted && source.afterId) {
      progress = {
        ...progress,
        after_id: source.afterId,
        after_path: source.afterPath,
        finished: false,
      }
    } else {
      progress = { ...progress, finished: true }
    }
    await dependencies.putProgress(progress)
    if (!progress.finished) {
      const publishedAnotherPage = pageRows.length > 0
      return {
        manifest: null,
        hasMore: true,
        generationId: progress.generation_id,
        continuationId: publishedAnotherPage
          ? `${progress.generation_id}-${progress.page_count + 1}`
          : `${progress.generation_id}-scan-${progress.after_id}`,
      }
    }
  }

  if (
    publishedManifest &&
    publishedManifest.generation_id !== progress.generation_id &&
    publishedManifest.content_hash === progress.content_hash
  ) {
    await Promise.all([
      dependencies.retireGeneration(progress.generation_id, progress.page_count),
      dependencies.afterPublication?.(),
    ])
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
    await putSitemapObjectFile(dependencies.indexStorageKey, index.filePath, {
      contentType: 'application/xml; charset=utf-8',
      contentEncoding: 'gzip',
      manifest,
    })
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
