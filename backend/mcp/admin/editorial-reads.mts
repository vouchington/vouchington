import { getPaginationLimitsForContract } from '@services/pagination'
import assert from 'http-assert'
import { getUnmappedRssFeedItemCategories } from '@services/rss-feed-items'
import {
  getImportBatch,
  getImportRowsByBatchId,
  getImportBatchProgress,
  currentUserCanViewImportBatch,
} from '@services/admin-imports'
import { getAdminArticleSyncStatus } from '@services/admin-imports/article-sync-controls'
import { getLandingPageById, listLandingPagesForUserPage } from '@services/my'
import { getLandingPageAnalyticsByPageId } from '@services/landing-page-analytics'
import { getSignupCountByReferrerId } from '@services/attribution'
import { createPaginationParser } from '@modules/pagination'
import { adminInput, createAdminTool, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const categoriesApi = { method: 'GET', path: '/api/v1/rss-feed-categories' } as const
const categories = createAdminTool<{
  status?: 'pending' | 'rejected' | 'all'
  after?: string
  limit?: number
}>({
  name: 'list_unmapped_rss_categories',
  description: 'Read a bounded page of unmapped RSS categories.',
  scope: 'editorial:read',
  api: categoriesApi,
  parameters: adminInput({
    ...PAGE_INPUT,
    status: { type: 'string', enum: ['pending', 'rejected', 'all'] },
  }),
  outputSchema: adminRouteOutputSchema(categoriesApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (_, args) => getUnmappedRssFeedItemCategories(args),
})
const importApi = { method: 'GET', path: '/api/v1/imports/{batchId}' } as const
const batch = createAdminTool<{ batch_id: string }>({
  name: 'get_import_batch',
  description: 'Read an import batch, its rows and progress.',
  scope: 'editorial:read',
  api: importApi,
  parameters: adminInput({ batch_id: UUID_INPUT }, ['batch_id']),
  outputSchema: adminRouteOutputSchema(importApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const batch = await getImportBatch(args.batch_id)
    assert(batch && currentUserCanViewImportBatch(user, batch), 404, 'Import batch not found')
    const [rows, progress] = await Promise.all([
      getImportRowsByBatchId(batch.id),
      getImportBatchProgress(batch.id),
    ])
    return { batch, rows, progress }
  },
})
const syncApi = { method: 'GET', path: '/api/v1/article-syncs/{jobId}' } as const
const sync = createAdminTool<{ job_id: string }>({
  name: 'get_article_sync',
  description: 'Read the current status of an article sync job.',
  scope: 'editorial:read',
  api: syncApi,
  parameters: adminInput({ job_id: { type: 'string', minLength: 1, maxLength: 200 } }, ['job_id']),
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'completed', 'failed'] },
      error: { type: 'string' },
      result: { type: 'object', additionalProperties: true },
    },
    required: ['status'],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (user, args) => getAdminArticleSyncStatus(user, args.job_id),
})
const pagesApi = { method: 'GET', path: '/api/v1/admin/users/{userId}/landing-pages' } as const
const pagination = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 25 },
})
const pages = createAdminTool<{ user_id: string; after?: string; limit?: number }>({
  name: 'list_user_landing_pages',
  description: 'Read a bounded page of a user’s landing pages.',
  scope: 'editorial:read',
  api: pagesApi,
  parameters: adminInput({ ...PAGE_INPUT, user_id: UUID_INPUT }, ['user_id']),
  outputSchema: adminRouteOutputSchema(pagesApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_, args) => {
    const parsed = pagination.parse(args, getPaginationLimitsForContract(pagination.queryContract))
    return listLandingPagesForUserPage(args.user_id, { limit: parsed.limit, after: parsed.after })
  },
})
const analyticsApi = {
  method: 'GET',
  path: '/api/v1/admin/landing-pages/{pageId}/analytics',
} as const
const analytics = createAdminTool<{ page_id: string }>({
  name: 'get_landing_page_analytics',
  description: 'Read landing-page analytics and the signup conversion funnel.',
  scope: 'editorial:read',
  api: analyticsApi,
  parameters: adminInput({ page_id: UUID_INPUT }, ['page_id']),
  outputSchema: adminRouteOutputSchema(analyticsApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_, args) => {
    const page = await getLandingPageById(args.page_id)
    const [analytics, totalSignups] = await Promise.all([
      getLandingPageAnalyticsByPageId(page.id),
      getSignupCountByReferrerId(page.user_id),
    ])
    return {
      landing_page: page,
      analytics: {
        ...analytics,
        conversion_funnel: {
          total_visits: analytics.total_visits,
          total_clicks: analytics.total_clicks,
          total_signups: totalSignups,
          visit_to_click_rate: analytics.ctr,
        },
      },
    }
  },
})
export const adminEditorialReadTools = [categories, batch, sync, pages, analytics]
