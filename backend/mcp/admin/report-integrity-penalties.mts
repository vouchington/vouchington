import assert from 'http-assert'
import {
  getReportAbusePenalties,
  applyReportAbusePenalty,
  revokeReportAbusePenalty,
  getReportAbusePenaltyReviewsDue,
  reviewReportAbusePenalty,
} from '@services/report-integrity'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { userReferenceSchema } from '../entity-reference-schema.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const listApi = { method: 'GET', path: '/api/v1/report-integrity/penalties' } as const
const reviewDueApi = {
  method: 'GET',
  path: '/api/v1/report-integrity/penalties/review-due',
} as const
const listOutput = adminRouteOutputSchema(listApi)
const reviewDueOutput = adminRouteOutputSchema(reviewDueApi)
const liftApi = { method: 'DELETE', path: '/api/v1/report-integrity/penalties/:id' } as const
const reviewApi = {
  method: 'POST',
  path: '/api/v1/report-integrity/penalties/:id/reviews',
} as const
const liftOutput = adminRouteOutputSchema(liftApi)
const reviewOutput = adminRouteOutputSchema(reviewApi)

type PenaltyQuery = {
  status?: 'active' | 'revoked'
  source?: 'flag'
  user_id?: string
  source_flag_id?: string
  after?: string
  limit?: number
  review_due?: boolean
}
type PenaltyMutation = { id: string; review?: boolean }

export const adminReportIntegrityPenaltyTools = [
  createAdminTool<PenaltyQuery>({
    name: 'list_report_abuse_penalties',
    description:
      'Page account penalties with scoped filters. Pass review_due to page active penalties whose annual review is due; that listing takes only after and limit.',
    scope: 'account-enforcement:read',
    api: [listApi, reviewDueApi],
    selectApi: args => [args.review_due ? reviewDueApi : listApi],
    selectOutputSchema: args => (args.review_due ? reviewDueOutput : listOutput),
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: ['active', 'revoked'] },
      user_id: userReferenceSchema,
      source_flag_id: UUID_INPUT,
      review_due: { type: 'boolean' },
    }),
    outputSchema: { type: 'object', anyOf: [listOutput, reviewDueOutput] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => {
      if (args.review_due) {
        assert(
          args.status === undefined &&
            args.user_id === undefined &&
            args.source_flag_id === undefined,
          422,
          'Review-due listing does not take penalty filters',
        )
        return getReportAbusePenaltyReviewsDue({ after: args.after, limit: args.limit })
      }
      const options = { ...args, userId: args.user_id, sourceFlagId: args.source_flag_id }
      return getReportAbusePenalties(options)
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'apply_report_abuse_penalty',
    description: 'Apply penalties from an unresolved flag and resolve it atomically.',
    scope: 'account-enforcement:penalize',
    api: { method: 'POST', path: '/api/v1/report-integrity/flags/:id/penalties' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({
      method: 'POST',
      path: '/api/v1/report-integrity/flags/:id/penalties',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) => applyReportAbusePenalty(user.id, args.id),
  }),
  createAdminTool<PenaltyMutation>({
    name: 'lift_report_abuse_penalty',
    description:
      'Revoke an active account penalty. Pass review to confirm a due penalty and schedule its next annual review instead of revoking it.',
    scope: 'account-enforcement:penalize',
    api: [liftApi, reviewApi],
    selectApi: args => [args.review ? reviewApi : liftApi],
    selectOutputSchema: args => (args.review ? reviewOutput : liftOutput),
    parameters: adminInput({ id: UUID_INPUT, review: { type: 'boolean' } }, ['id']),
    outputSchema: { type: 'object', anyOf: [liftOutput, reviewOutput] },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) =>
      args.review
        ? reviewReportAbusePenalty(args.id, user.id).then(penalty => ({ penalty }))
        : revokeReportAbusePenalty(user.id, args.id),
  }),
]
