import type { SitemapGenerationProgress } from './generation-storage.mts'
import type { PostDayManifest } from './storage.mts'
import type { SitemapUrl } from './types.mts'

export type SourceEntry = { id: string; path?: string }

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
}
