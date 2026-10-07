import assert from 'http-assert'
import { getPostByAnyCached } from '@services/entity-fetch'
import { updateClearanceStatus, searchPostsForAdminReview } from '@services/post-clearance'
import {
  parseStaffClearanceDecision,
  type StaffClearanceDecision,
} from '@services/post-clearance/parse-staff-decision'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const mutationEndpoint = { method: 'POST', path: '/api/v1/posts/:idOrSlug/clearances' } as const
function clearanceTool(
  name: string,
  statuses: StaffClearanceDecision['status'][],
  scope: 'moderation:write' | 'moderation:approve',
) {
  return createAdminTool<StaffClearanceDecision & { id: string }>({
    name,
    description:
      'Change staff post clearance with a stable reason and audited decision. Agent actions do not create training feedback.',
    scope,
    api: mutationEndpoint,
    parameters: adminInput(
      {
        id: UUID_INPUT,
        status: { type: 'string', enum: statuses },
        reason_code: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,99}$' },
        private_note: { type: 'string', maxLength: 4000 },
      },
      ['id', 'status', 'reason_code'],
    ),
    outputSchema: adminRouteOutputSchema(mutationEndpoint),
    annotations: {
      readOnlyHint: false,
      destructiveHint: scope === 'moderation:write',
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      const body = parseStaffClearanceDecision(args)
      const post = await getPostByAnyCached(args.id)
      assert(post && !post.deleted_at, 404, 'Post not found')
      await updateClearanceStatus(post.id, body.status, user.id, 'agent', {
        reasonCode: body.reason_code,
        privateNote: body.private_note,
        platformOverride: true,
      })
      return { clearance_status: body.status }
    },
  })
}
export const adminClearanceTools = [
  createAdminTool<{ after?: string; limit?: number }>({
    name: 'list_post_review_queue',
    description: 'Page posts awaiting global staff review.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/posts/review-queue' },
    parameters: adminInput(PAGE_INPUT),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/posts/review-queue' }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => searchPostsForAdminReview({ ...args, limit: args.limit ?? 25 }),
  }),
  clearanceTool('set_post_clearance', ['rejected', 'in_review'], 'moderation:write'),
  clearanceTool('approve_post_clearance', ['approved', 'pending'], 'moderation:approve'),
]
