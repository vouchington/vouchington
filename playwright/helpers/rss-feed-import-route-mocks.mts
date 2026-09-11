import type { Page } from '@playwright/test'

export const DEFAULT_RSS_FEED_IMPORT_ID = '01900000-0000-7000-8000-000000000001'
export const DEFAULT_RSS_FEED_IMPORT_CREATED_AT = '2026-05-31T00:00:00.000Z'
export const DEFAULT_RSS_FEED_IMPORT_COMPLETED_AT = '2026-05-31T00:00:01.000Z'

export const RSS_FEED_IMPORT_ROUTE_PATTERNS = {
  submit: '**/api/v1/my/import/rss-feeds',
  status: (importId: string) => `**/api/v1/my/import/rss-feeds/${importId}`,
} as const

interface RssFeedImportRow {
  id?: string
  input: string
  status:
    | 'pending'
    | 'followed'
    | 'imported'
    | 'source_created'
    | 'recommendation_created'
    | 'already_following'
    | 'error'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}

interface RssFeedImportRouteMockOptions {
  importId?: string
  totalRows?: number
  completedRows?: number
  failedRows?: number
  pendingRows?: number
  createdAt?: string
  completedAt?: string | null
  rows?: RssFeedImportRow[]
}

export async function mockCompletedRssFeedImport(
  page: Page,
  options: RssFeedImportRouteMockOptions = {},
): Promise<void> {
  const importId = options.importId ?? DEFAULT_RSS_FEED_IMPORT_ID
  const totalRows = options.totalRows ?? 2
  const completedRows = options.completedRows ?? totalRows
  const failedRows = options.failedRows ?? 0
  const pendingRows = options.pendingRows ?? 0
  const createdAt = options.createdAt ?? DEFAULT_RSS_FEED_IMPORT_CREATED_AT
  const completedAt =
    options.completedAt === undefined ? DEFAULT_RSS_FEED_IMPORT_COMPLETED_AT : options.completedAt
  const importSummary = {
    id: importId,
    total_rows: totalRows,
    completed_rows: completedRows,
    failed_rows: failedRows,
    pending_rows: pendingRows,
    completed_at: completedAt,
    created_at: createdAt,
  }

  await page.route(RSS_FEED_IMPORT_ROUTE_PATTERNS.submit, async route => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        import: importSummary,
        status_url: `/api/v1/my/import/rss-feeds/${importId}`,
      }),
    })
  })

  await page.route(RSS_FEED_IMPORT_ROUTE_PATTERNS.status(importId), async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        import: importSummary,
        rows: options.rows ?? [],
      }),
    })
  })
}
