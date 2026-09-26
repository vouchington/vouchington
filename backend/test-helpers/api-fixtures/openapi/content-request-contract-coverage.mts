import { expect } from 'vitest'

import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'

type Schema = Record<string, unknown>

export function assertContentRequestContractCoverage(document: OpenApiDocument): void {
  const bundle = buildRequestContractsBundle(document)
  const components = bundle.components as Record<string, Schema>

  expectConcreteBodies(bundle, components)
  expectPostContentBodies(bundle, components)
  expectMeaningfulCarriers(bundle)
}

function expectConcreteBodies(
  bundle: ReturnType<typeof buildRequestContractsBundle>,
  components: Record<string, Schema>,
): void {
  const expected = [
    ['PATCH:/api/v1/posts/:idOrSlug/ratings/:topicId', [], { rating: { type: 'number' } }],
    [
      'POST:/api/v1/posts/:idOrSlug/ratings',
      ['order_index', 'rating', 'topic_id'],
      { order_index: { type: 'number' }, rating: { type: 'number' }, topic_id: { type: 'string' } },
    ],
    ['PATCH:/api/v1/referral-link-validations/:idOrSlug', [], { slug: { type: 'string' } }],
    [
      'PATCH:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
      [],
      { hostname: { type: 'string' }, is_referral_link_url: { type: 'boolean' } },
    ],
    ['PATCH:/api/v1/referral-links/:linkId', [], {}],
    ['POST:/api/v1/referral-link-validations', ['slug'], { slug: { type: 'string' } }],
    [
      'POST:/api/v1/referral-link-validations/:validationId/rules',
      ['hostname', 'pathname'],
      { hostname: { type: 'string' }, pathname: { type: 'string' } },
    ],
    [
      'POST:/api/v1/referral-links',
      ['referral_program_id', 'url'],
      { referral_program_id: { type: 'string' }, url: { type: 'string' } },
    ],
    [
      'POST:/api/v1/topics/:idOrSlug/claims',
      ['claimed_role'],
      { claimed_role: { type: 'string' }, evidence: { type: 'string' } },
    ],
    [
      'POST:/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
      ['evidence'],
      { evidence: { type: 'string' } },
    ],
    [
      'POST:/api/v1/topics/:referralProgramId/referral-program/link-validations',
      ['validation_id'],
      { validation_id: { type: 'string' } },
    ],
  ] as const

  for (const [operation, required, properties] of expected) {
    expectObjectBody(bundle, components, operation, required, properties)
  }

  expectNullableProperty(bundle, components, 'PATCH:/api/v1/referral-links/:linkId', 'label')
  expectNullableProperty(
    bundle,
    components,
    'POST:/api/v1/referral-link-validations',
    'user_help_text',
  )
  expectNullableProperty(
    bundle,
    components,
    'POST:/api/v1/referral-link-validations/:validationId/rules',
    'is_referral_link_url',
  )
}

function expectPostContentBodies(
  bundle: ReturnType<typeof buildRequestContractsBundle>,
  components: Record<string, Schema>,
): void {
  expectObjectBody(bundle, components, 'POST:/api/v1/posts', [], {
    images: { type: 'array' },
    post_type: { type: 'string' },
  })
  expectObjectBody(bundle, components, 'PATCH:/api/v1/posts/:idOrSlug', [], {
    ai_summary_markdown: { type: 'string' },
    images: { type: 'array' },
  })
  expectObjectBody(bundle, components, 'PUT:/api/v1/posts/:idOrSlug/images', ['images'], {
    images: { type: 'array' },
  })
  expectObjectBody(bundle, components, 'POST:/api/v1/posts/:idOrSlug/clearances', [
    'reason_code',
    'status',
  ])
  expectObjectBody(bundle, components, 'POST:/api/v1/rss-feeds/:id/refreshes', [], {
    force: { type: 'boolean' },
  })
}

function expectMeaningfulCarriers(bundle: ReturnType<typeof buildRequestContractsBundle>): void {
  const expectedCarriers = {
    'POST:/api/v1/posts': ['body'],
    'PATCH:/api/v1/posts/:idOrSlug': ['body', 'path'],
    'PUT:/api/v1/posts/:idOrSlug/images': ['body', 'path'],
    'POST:/api/v1/posts/:idOrSlug/clearances': ['body', 'path'],
    'POST:/api/v1/rss-feeds/:id/refreshes': ['body', 'path', 'query'],
  } as const
  for (const [operation, expected] of Object.entries(expectedCarriers)) {
    const carriers = bundle.operations[operation] as Record<string, unknown> | undefined
    expect(carriers).toBeDefined()
    for (const carrier of expected) expect(carriers?.[carrier]).toBeDefined()
  }
}

function expectObjectBody(
  bundle: ReturnType<typeof buildRequestContractsBundle>,
  components: Record<string, Schema>,
  operation: string,
  required: readonly string[],
  properties: Record<string, unknown> = {},
): void {
  const schema = resolveBody(bundle, components, operation)
  expect(schema).toMatchObject({ additionalProperties: false, properties, type: 'object' })
  const actualRequired = Array.isArray(schema.required) ? schema.required : []
  expect(actualRequired).toEqual(expect.arrayContaining([...required]))
}

function expectNullableProperty(
  bundle: ReturnType<typeof buildRequestContractsBundle>,
  components: Record<string, Schema>,
  operation: string,
  property: string,
): void {
  const schema = resolveBody(bundle, components, operation)
  const propertySchema = (schema.properties as Record<string, Schema> | undefined)?.[property]
  expect(propertySchema?.anyOf).toEqual(expect.arrayContaining([{ type: 'null' }]))
}

function resolveBody(
  bundle: ReturnType<typeof buildRequestContractsBundle>,
  components: Record<string, Schema>,
  operation: string,
): Schema {
  const carriers = bundle.operations[operation] as { body?: Schema } | undefined
  expect(carriers?.body).toBeDefined()
  const body = carriers?.body
  if (!body) throw new Error(`${operation} has no body schema`)
  const ref = typeof body.$ref === 'string' ? body.$ref.split('/').at(-1) : undefined
  return ref ? components[ref]! : body
}
