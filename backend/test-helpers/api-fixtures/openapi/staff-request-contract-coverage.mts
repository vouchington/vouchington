import { expect } from 'vitest'

import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'

type Bundle = ReturnType<typeof buildRequestContractsBundle>
type Schema = Record<string, unknown>

// Operation, then the body fields the generated closed schema must require (issue #297).
const BODY_CONTRACTS = [
  ['POST:/api/v1/reports', ['entityId', 'entityType', 'reason']],
  ['PATCH:/api/v1/reports/:id', ['status']],
  ['POST:/api/v1/appeals', ['appeal_reason', 'target_type']],
  ['PATCH:/api/v1/appeals/:id', []],
  ['POST:/api/v1/appeals/:id/resolution', ['action']],
  ['POST:/api/v1/disputes', ['claim_text', 'post_id', 'reason']],
  ['PATCH:/api/v1/disputes/:id', []],
  ['POST:/api/v1/disputes/:id/resolution', ['action']],
  ['DELETE:/api/v1/disputes/:id/annotation', ['annotation_id']],
  ['POST:/api/v1/posts/batch-dispute-annotations', ['post_ids']],
  ['POST:/api/v1/images/upload-url', ['content_length', 'content_type']],
  ['DELETE:/api/v1/membership-grants/:grantId', ['reason']],
  ['POST:/api/v1/membership-purchase-intents', ['idempotency_key', 'product_id', 'provider']],
  ['POST:/api/v1/membership-verifications', ['evidence', 'idempotency_key', 'provider']],
  ['POST:/api/v1/memberships/billing-portal-sessions', ['return_url']],
  ['POST:/api/v1/memberships/refunds', ['idempotency_key', 'invoice_id', 'reason', 'user_id']],
  ['POST:/api/v1/psql/jobs', ['type']],
  ['POST:/api/v1/valkey/flush', ['concern']],
  ['POST:/api/v1/valkey/caches/clear', ['group']],
  ['POST:/api/v1/valkey/bloom-filters/rebuild', ['filter']],
  ['PUT:/api/v1/crawlers/referral-program', ['hostname_id', 'referral_program_id']],
  ['PATCH:/api/v1/crawlers/:id', []],
  ['POST:/api/v1/admin/warnings', ['reason', 'userId']],
  ['POST:/api/v1/admin/topic-claims/:id/rejection', ['rejection_reason']],
  ['POST:/api/v1/admin/topic-claims/:id/revocation', ['revocation_reason']],
  ['POST:/api/v1/imports/topics', ['csv']],
  ['POST:/api/v1/rss-feed-categories/assignments', ['category_text', 'topic_id']],
  ['POST:/api/v1/rss-feed-categories/rejections', ['category_text']],
  ['DELETE:/api/v1/rss-feed-categories/rejections', ['category_text']],
  ['PATCH:/api/v1/stories/:id', ['title']],
  ['PUT:/api/v1/stories/:storyId/official', ['rss_feed_item_id']],
  ['POST:/api/v1/admin/users/:userId/identity-verification-attempts', ['note']],
] as const

// Operations whose only executable carrier is the path.
const PATH_ONLY = [
  'GET:/api/v1/appeals/:id',
  'GET:/api/v1/disputes/:id',
  'GET:/api/v1/crawlers/:id',
  'GET:/api/v1/posts/:postId/disputes',
  'GET:/api/v1/images/:id/upload-state',
  'GET:/api/v1/memberships/history/:userId',
  'POST:/api/v1/reports/:id/judgements',
  'POST:/api/v1/appeals/:id/approval',
  'POST:/api/v1/disputes/:id/delivery',
  'DELETE:/api/v1/stories/:storyId/items/:itemId',
] as const

export function assertStaffRequestContractCoverage(document: OpenApiDocument): void {
  const bundle = buildRequestContractsBundle(document)
  const components = bundle.components as Record<string, Schema>

  for (const [operation, required] of BODY_CONTRACTS) {
    const schema = resolveBody(bundle, components, operation)
    expect({ operation, schema }).toMatchObject({
      operation,
      schema: { additionalProperties: false, type: 'object' },
    })
    const actualRequired = Array.isArray(schema.required) ? schema.required : []
    expect({ operation, required: actualRequired }).toEqual({
      operation,
      required: expect.arrayContaining([...required]),
    })
  }
  for (const operation of PATH_ONLY) {
    const carriers = bundle.operations[operation] as Record<string, unknown> | undefined
    expect({ operation, hasPath: carriers?.path !== undefined }).toEqual({
      operation,
      hasPath: true,
    })
  }
  expectClosedMoney(bundle, components)
}

// Money bodies are integer minor units in a closed currency enum; scaled or unknown values are 422.
function expectClosedMoney(bundle: Bundle, components: Record<string, Schema>): void {
  const refund = resolveBody(bundle, components, 'POST:/api/v1/memberships/refunds')
  const amount = (refund.properties as Record<string, Schema>).amount
  const money =
    typeof amount?.$ref === 'string' ? components[amount.$ref.split('/').at(-1)!] : amount
  expect(money).toMatchObject({
    additionalProperties: false,
    properties: { amount: { type: 'integer' }, currency: { enum: expect.any(Array) } },
  })
}

function resolveBody(
  bundle: Bundle,
  components: Record<string, Schema>,
  operation: string,
): Schema {
  const carriers = bundle.operations[operation] as { body?: Schema } | undefined
  expect({ operation, hasBody: carriers?.body !== undefined }).toEqual({ operation, hasBody: true })
  const body = carriers!.body!
  const ref = typeof body.$ref === 'string' ? body.$ref.split('/').at(-1) : undefined
  return ref ? components[ref]! : body
}
