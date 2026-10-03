export type ArticleSyncItem = {
  file: string
  slug: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

export type ArticleSyncResult = {
  results: ArticleSyncItem[]
  summary: { created: number; updated: number; skipped: number; errored: number }
}
