import type { ReviewDisputeStatus } from '@services/review-disputes/config'
import { filterReviewDisputePostContentForViewer } from '@services/posts/filter-review-dispute-post-content'
import assert from 'http-assert'
import { getReviewDisputeById, REVIEW_DISPUTE_STATUSES } from '@services/review-disputes'
import { listReviewDisputePage } from '@services/review-disputes/list-page'
import { createAdminTool, adminInput, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const readAnnotations = { readOnlyHint: true, openWorldHint: false } as const
export const adminDisputesReadTools = [
  createAdminTool<{ status?: ReviewDisputeStatus; limit?: number; after?: string }>({
    name: 'list_review_disputes',
    description: 'List staff disputes with scoped cursor pagination.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/disputes' },
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: REVIEW_DISPUTE_STATUSES },
    }),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/disputes' }, 'staff'),
    annotations: readAnnotations,
    run: async (user, args) => {
      const page = await listReviewDisputePage({ ...args, audience: 'staff' })
      return {
        ...page,
        disputes: await filterReviewDisputePostContentForViewer(user, page.disputes),
      }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'get_review_dispute',
    description: 'Read the full staff dispute projection.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/disputes/:id' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/disputes/:id' }, 'staff'),
    annotations: readAnnotations,
    run: async (user, { id }) => {
      const dispute = await getReviewDisputeById(id)
      assert(dispute, 404, 'Dispute not found')
      const [visible] = await filterReviewDisputePostContentForViewer(user, [dispute])
      return { dispute: visible! }
    },
  }),
]
