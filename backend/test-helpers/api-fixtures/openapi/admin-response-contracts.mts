import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'

// Staff MCP endpoints whose inline/non-200 schemas were formerly read from the published spec.
const ADMIN_RESPONSE_OPERATIONS = [
  'DELETE:/api/v1/users/:userId/suspension',
  'DELETE:/api/v1/vote-integrity/penalties/:id',
  'GET:/api/v1/admin/landing-pages/:pageId/analytics',
  'GET:/api/v1/admin/modlog',
  'GET:/api/v1/admin/topic-claims',
  'GET:/api/v1/admin/warnings',
  'GET:/api/v1/appeals',
  'GET:/api/v1/appeals/:id',
  'GET:/api/v1/article-syncs/:jobId',
  'GET:/api/v1/copyright-email-intakes/:id',
  'GET:/api/v1/copyright-email-intakes/review-queue',
  'GET:/api/v1/copyright-notices/:id',
  'GET:/api/v1/copyright-notices/:id/guest-capabilities',
  'GET:/api/v1/copyright-notices/:id/participant',
  'GET:/api/v1/copyright-notices/:id/repeat-infringer-accounts',
  'GET:/api/v1/copyright-notices/review-queue',
  'GET:/api/v1/crawlers',
  'GET:/api/v1/crawlers/:id',
  'GET:/api/v1/disputes',
  'GET:/api/v1/disputes/:id',
  'GET:/api/v1/dynamic-config/namespaces',
  'GET:/api/v1/dynamic-config/namespaces/:namespace',
  'GET:/api/v1/dynamic-config/namespaces/:namespace/history',
  'GET:/api/v1/imports/:batchId',
  'GET:/api/v1/mq/backfills',
  'GET:/api/v1/mq/queues',
  'GET:/api/v1/mq/scheduled-jobs',
  'GET:/api/v1/mq/stats',
  'GET:/api/v1/report-integrity/flags',
  'GET:/api/v1/reports',
  'GET:/api/v1/rss-feed-categories',
  'GET:/api/v1/users/:userId/mod-notes',
  'GET:/api/v1/users/:userId/moderation-context',
  'GET:/api/v1/vote-integrity/flags',
  'PATCH:/api/v1/appeals/:id',
  'PATCH:/api/v1/crawlers/:id',
  'PATCH:/api/v1/disputes/:id',
  'PATCH:/api/v1/dynamic-config/namespaces/:namespace',
  'PATCH:/api/v1/report-integrity/flags/:id',
  'PATCH:/api/v1/reports/:id',
  'PATCH:/api/v1/stories/:id',
  'PATCH:/api/v1/vote-integrity/flags/:id',
  'POST:/api/v1/admin/topic-claims/:id/rejection',
  'POST:/api/v1/admin/topic-claims/:id/revocation',
  'POST:/api/v1/admin/topic-claims/:id/verification',
  'POST:/api/v1/admin/warnings',
  'POST:/api/v1/appeals/:id/approval',
  'POST:/api/v1/appeals/:id/delivery',
  'POST:/api/v1/appeals/:id/resolution',
  'POST:/api/v1/appeals/:id/resolution-drafts',
  'POST:/api/v1/article-syncs',
  'POST:/api/v1/copyright-email-intakes/:id/approvals',
  'POST:/api/v1/copyright-email-intakes/:id/correspondence',
  'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
  'POST:/api/v1/copyright-email-intakes/:id/rejections',
  'POST:/api/v1/copyright-email-intakes/:id/reply/replays',
  'POST:/api/v1/copyright-form-intakes/:id/reviews',
  'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions',
  'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
  'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
  'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
  'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
  'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements',
  'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions',
  'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes',
  'POST:/api/v1/copyright-submissions/:id/appeal-reviews',
  'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews',
  'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments',
  'POST:/api/v1/disputes/:id/approval',
  'POST:/api/v1/disputes/:id/delivery',
  'POST:/api/v1/disputes/:id/resolution',
  'POST:/api/v1/disputes/:id/resolution-drafts',
  'POST:/api/v1/imports/topics',
  'POST:/api/v1/mq/backfills/:id/runs',
  'POST:/api/v1/mq/queues/:name/pause',
  'POST:/api/v1/mq/queues/:name/resume',
  'POST:/api/v1/mq/queues/:name/retry-failed',
  'POST:/api/v1/mq/scheduled-jobs/:id/runs',
  'POST:/api/v1/posts/:idOrSlug/clearances',
  'POST:/api/v1/report-integrity/flags/:id/penalties',
  'POST:/api/v1/reports/:id/judgements',
  'POST:/api/v1/rss-feed-categories/assignments',
  'POST:/api/v1/rss-feed-categories/rejections',
  'POST:/api/v1/users/:userId/mod-notes',
  'PUT:/api/v1/crawlers/referral-program',
  'PUT:/api/v1/stories/:storyId/official',
  'PUT:/api/v1/users/:userId/suspension',
] as const

export function buildAdminResponseContracts(document: OpenApiDocument) {
  return Object.fromEntries(
    ADMIN_RESPONSE_OPERATIONS.flatMap(key => {
      const separator = key.indexOf(':')
      const method = key.slice(0, separator)
      const route = key.slice(separator + 1)
      const operation = document.paths[route.replace(/:([^/]+)/g, '{$1}')]?.[method.toLowerCase()]
      if (!operation) return []
      const responses = operation.responses
      const response = responses?.['200'] ?? responses?.['201'] ?? responses?.['202']
      const schema =
        response && 'content' in response
          ? response.content?.['application/json']?.schema
          : undefined
      if (!schema) throw new Error(`No staff response contract for ${key}`)
      return [[key, schema]]
    }),
  )
}
