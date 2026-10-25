import { readSitemapFamilyPage } from './family-queries.mts'
import { generateSitemapPage, type GenerationPageResult } from './generation-page.mts'
import {
  buildFamilyIndexRoutePath,
  buildFamilyIndexStorageKey,
  buildFamilyPageRoutePath,
  buildFamilyPageStorageKey,
} from './generated-paths.mts'
import {
  deleteSitemapFamilyProgress,
  getSitemapFamilyProgress,
  putSitemapFamilyProgress,
  putRetiredSitemapGeneration,
} from './generation-storage.mts'
import { getSitemapFamilyManifest } from './storage.mts'
import { buildFamilySitemapUrl, buildSitemapUrl } from './url-builder.mts'
import { getSitemapsWorkLimit } from './work-limits.mts'
import type { SitemapFamilyEntry, SitemapFamilyType } from './types.mts'

export async function generateSitemapFamilyFiles(
  family: SitemapFamilyType,
): Promise<GenerationPageResult> {
  return generateSitemapPage<SitemapFamilyEntry>(
    getSitemapsWorkLimit('generation_page_row_limit'),
    {
      getProgress: () => getSitemapFamilyProgress(family),
      getManifest: () => getSitemapFamilyManifest(family),
      putProgress: progress => putSitemapFamilyProgress(family, progress),
      deleteProgress: () => deleteSitemapFamilyProgress(family),
      readPage: options => readSitemapFamilyPage(family, options),
      pageStorageKey: (generationId, page) => buildFamilyPageStorageKey(family, generationId, page),
      pageRoutePath: (generationId, page) => buildFamilyPageRoutePath(family, generationId, page),
      indexStorageKey: buildFamilyIndexStorageKey(family),
      retireGeneration: (generationId, pageCount) =>
        putRetiredSitemapGeneration({
          generation_id: generationId,
          page_prefix: buildFamilyPageStorageKey(family, generationId, 1).replace(/1\.xml$/, ''),
          page_count: pageCount,
          next_page: 1,
          retire_after: new Date(
            Date.now() + getSitemapsWorkLimit('retired_generation_grace_seconds') * 1000,
          ).toISOString(),
        }),
      toUrl: buildFamilySitemapUrl,
    },
  )
}

export function buildSitemapFamilyIndexEntry(family: SitemapFamilyType): { loc: string } {
  return { loc: buildSitemapUrl(buildFamilyIndexRoutePath(family)) }
}
