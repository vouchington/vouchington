import { expect } from 'vitest'

import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'

type Schema = Record<string, unknown>

// Operation, then the carriers its generated request contract must declare (issue #1514).
// Query parameter names are pinned by the real-backend query contract catalog test.
const CARRIERS = [
  ['POST:/api/v1/blacklist/source-sync', ['body']],
  ['DELETE:/api/v1/curated-aside-items/:id', ['path']],
  ['POST:/api/v1/curated-aside-items', ['body']],
  ['PUT:/api/v1/curated-aside-items/order', ['body']],
  ['GET:/api/v1/currencies', ['query']],
  ['GET:/api/v1/dynamic-config/namespaces/:namespace', ['path']],
  ['GET:/api/v1/dynamic-config/namespaces/:namespace/history', ['path']],
  ['PATCH:/api/v1/dynamic-config/namespaces/:namespace', ['body', 'path']],
  ['GET:/api/v1/fediverse/instances/:id', ['path']],
  ['GET:/api/v1/fediverse/search', ['query']],
  ['POST:/api/v1/fediverse/instances', ['body']],
  ['POST:/api/v1/fediverse/instances/:id/integration-changes', ['body', 'path']],
  ['POST:/api/v1/moderation/reveals', ['body']],
  ['GET:/api/v1/moderation-transparency', ['query']],
  ['POST:/api/v1/mq/backfills/:id/runs', ['path']],
  ['POST:/api/v1/mq/queues/:name/pause', ['path']],
  ['POST:/api/v1/mq/queues/:name/resume', ['path']],
  ['POST:/api/v1/mq/queues/:name/retry-failed', ['path']],
  ['POST:/api/v1/mq/scheduled-jobs/:id/runs', ['path']],
  ['DELETE:/api/v1/report-integrity/penalties/:id', ['path']],
  ['GET:/api/v1/report-integrity/flags/:id', ['path']],
  ['GET:/api/v1/report-integrity/penalties/:id', ['path']],
  ['PATCH:/api/v1/report-integrity/flags/:id', ['body', 'path']],
  ['POST:/api/v1/report-integrity/flags/:id/penalties', ['path']],
  ['DELETE:/api/v1/topic-recommendations/:id', ['path']],
  ['GET:/api/v1/topic-recommendations/:id', ['path']],
  ['GET:/api/v1/topic-recommendations/top-hashtags', ['query']],
  ['PATCH:/api/v1/topic-recommendations/:id', ['body', 'path']],
  ['POST:/api/v1/topic-recommendations', ['body', 'header']],
  ['POST:/api/v1/topic-recommendations/:id/approvals', ['path']],
  ['POST:/api/v1/topic-recommendations/:id/rejections', ['body', 'path']],
  ['POST:/api/v1/urls/:id/crawl', ['path']],
  ['DELETE:/api/v1/users/:userId/mod-notes/:noteId', ['path']],
  ['DELETE:/api/v1/users/:userId/preservation-hold', ['path']],
  ['DELETE:/api/v1/users/:userId/suspension', ['path']],
  ['DELETE:/api/v1/users/:userId/vote-weight', ['path']],
  ['GET:/api/v1/users/:userId/mod-notes', ['path', 'query']],
  ['GET:/api/v1/users/:userId/preservation-hold', ['path']],
  ['GET:/api/v1/users/:userId/moderation-context', ['path']],
  ['POST:/api/v1/users/:userId/mod-notes', ['body', 'path']],
  ['PUT:/api/v1/users/:userId/preservation-hold', ['body', 'path']],
  ['PUT:/api/v1/users/:userId/suspension', ['body', 'path']],
  ['PUT:/api/v1/users/:userId/vote-weight', ['body', 'path']],
  ['DELETE:/api/v1/vote-integrity/penalties/:id', ['path']],
  ['GET:/api/v1/vote-integrity/flags/:id', ['path']],
  ['GET:/api/v1/vote-integrity/penalties/:id', ['path']],
  ['PATCH:/api/v1/vote-integrity/flags/:id', ['body', 'path']],
  ['POST:/api/v1/vote-integrity/flags/:id/penalties', ['path']],
  ['GET:/api/v1/appeals', ['query']],
  ['GET:/api/v1/disputes', ['query']],
  ['GET:/api/v1/reports', ['query']],
  ['GET:/api/v1/admin/ai-costs', ['query']],
  ['GET:/api/v1/admin/modlog', ['query']],
  ['GET:/api/v1/posts/review-queue', ['query']],
  ['GET:/api/v1/rss-feed-categories', ['query']],
  ['GET:/api/v1/growth-metrics', ['query']],
  ['GET:/api/v1/admin/moderation-analytics', ['query']],
  ['GET:/api/v1/memberships/refundable-charges', ['query']],
  ['GET:/api/v1/admin/oauth-clients', ['query']],
] as const

export function assertModerationOperationsRequestContractCoverage(document: OpenApiDocument): void {
  const bundle = buildRequestContractsBundle(document)
  const components = bundle.components as Record<string, Schema>

  for (const [operation, carriers] of CARRIERS) {
    const actual = bundle.operations[operation] as Record<string, Schema> | undefined
    expect({ operation, carriers: Object.keys(actual ?? {}).toSorted() }).toEqual({
      operation,
      carriers: [...carriers].toSorted(),
    })
    if (actual?.body === undefined) continue
    const ref =
      typeof actual.body.$ref === 'string' ? actual.body.$ref.split('/').at(-1) : undefined
    expect({ operation, body: ref ? components[ref] : actual.body }).toMatchObject({
      operation,
      body: { additionalProperties: false, type: 'object' },
    })
  }
}
