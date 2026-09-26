import { execFile } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildOpenApiDocument } from './build-openapi-document.mts'
import {
  EXPECTED_UNAVAILABLE_REQUEST_ROUTES,
  EXPECTED_UNAVAILABLE_ROUTES,
} from './openapi-unavailable-route-ratchets.mts'
import type {
  OpenApiDocument,
  OpenApiResponse,
  OpenApiSchema,
} from 'vouchington-tooling/openapi-document'
import { openApiPaths, writeOpenApi } from './write-openapi.mts'
import { loadRegisteredRouteCatalog, routeShape } from '../registered-route-catalog.mts'
import { COLD_OPENAPI_BUILD_TIMEOUT_MS } from '../cold-build-budget.mts'
import { getBackendProgramBuildCount, getBackendProgramEntryCount } from '../backend-program.mts'

const run = promisify(execFile)
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

let doc: OpenApiDocument
let buildCountAfterHoist: number
let entryCountAfterHoist: number

function productionRequestSchema(path: string): OpenApiSchema {
  const requestBody = doc.paths[path]?.post?.requestBody
  expect(requestBody).toBeDefined()
  if (!requestBody) throw new Error(`${path} request body is missing`)
  expect(requestBody['x-request-schema-unavailable']).toBeUndefined()

  const schema = requestBody.content['application/json'].schema
  if (!schema.$ref) return schema
  const componentName = schema.$ref.split('/').at(-1)
  const component = componentName ? doc.components.schemas[componentName] : undefined
  expect(component).toBeDefined()
  if (!component) throw new Error(`${path} request schema component is missing`)
  return component
}

describe('openapi document generation', () => {
  // Build once here (see cold-build-budget.mts) — direct-call tests below read this closure;
  // only the two writeOpenApi() tests deliberately keep building fresh to exercise the write path.
  beforeAll(() => {
    doc = buildOpenApiDocument()
    buildCountAfterHoist = getBackendProgramBuildCount()
    entryCountAfterHoist = getBackendProgramEntryCount()
  }, COLD_OPENAPI_BUILD_TIMEOUT_MS)

  it(
    'keeps the committed api-fixtures/v1/openapi.json up to date with the generator',
    async () => {
      await expect(writeOpenApi({ check: true })).resolves.toBeUndefined()
    },
    COLD_OPENAPI_BUILD_TIMEOUT_MS,
  )

  it(
    'writes a well-formed document to disk',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'openapi-write-'))
      const path = join(root, 'openapi.json')

      await writeOpenApi({ path })

      const content = await readFile(path, 'utf8')
      expect(content).toContain('"openapi": "3.1.0"')
      expect(JSON.parse(content).paths).toBeTruthy()
    },
    COLD_OPENAPI_BUILD_TIMEOUT_MS,
  )

  it('never documents more unavailable routes than the frozen ratchet allows', () => {
    const known = new Set(EXPECTED_UNAVAILABLE_ROUTES)
    const newlyUnavailable = doc['x-unavailable-routes'].filter(route => !known.has(route))

    expect(newlyUnavailable).toEqual([])
  })

  it('never documents more unavailable request routes than the frozen ratchet allows', () => {
    const known = new Set(EXPECTED_UNAVAILABLE_REQUEST_ROUTES)
    const newlyUnavailable = doc['x-unavailable-request-routes'].filter(route => !known.has(route))

    expect(newlyUnavailable).toEqual([])
  })

  it('spot-checks request body shapes for known routes', () => {
    // Named-type body -> $ref (backend/api/v1/crawlers/index.mts's UpdateCrawlerUpdates cast).
    const namedTypeBody = doc.paths['/api/v1/crawlers/{id}']!.patch!.requestBody!
    expect(namedTypeBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/UpdateCrawlerUpdates',
    })
    expect(doc.components.schemas.UpdateCrawlerUpdates).toMatchObject({ type: 'object' })

    // Inline-literal body -> a plain object schema, not a $ref.
    const inlineBody = doc.paths['/api/v1/crawlers/referral-program']!.put!.requestBody!
    expect(inlineBody.content['application/json'].schema).toMatchObject({ type: 'object' })
    expect(inlineBody.content['application/json'].schema.$ref).toBeUndefined()

    // Record<string, unknown> body -> a permissive object schema (a shared named component,
    // since Record<string, unknown> is structurally identical wherever it's used).
    const resolvedRecordSchema = productionRequestSchema('/api/v1/images/upload-url')
    expect(resolvedRecordSchema.type).toBe('object')
    expect(resolvedRecordSchema.additionalProperties).not.toBe(false)

    // A bodyless mutation route omits requestBody entirely (not even the key present).
    expect(doc.paths['/api/v1/households/{id}']!.delete).not.toHaveProperty('requestBody')

    expect(productionRequestSchema('/api/v1/auth/bluesky/link').properties).toMatchObject({
      handle: { type: 'string' },
      callback_mode: { enum: ['native', 'web'], type: 'string' },
      completion_proof_challenge: { type: 'string' },
    })
    expect(
      productionRequestSchema('/api/v1/auth/bluesky/link-completions').properties,
    ).toMatchObject({
      flow_id: { type: 'string' },
      completion_token: { type: 'string' },
      completion_proof_verifier: { type: 'string' },
    })
    expect(productionRequestSchema('/api/v1/fediverse/instances').properties).toMatchObject({
      hostname: { type: 'string' },
    })
    expect(
      productionRequestSchema('/api/v1/fediverse/instances/{id}/integration-changes').properties,
    ).toMatchObject({
      integration_status: { enum: ['approved', 'blocked', 'pending'], type: 'string' },
      reason: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    })
  })

  it('marks membership-grant request fields required in OpenAPI', () => {
    const schema =
      doc.paths['/api/v1/membership-grants']!.post!.requestBody!.content['application/json'].schema
    expect(schema).toMatchObject({
      type: 'object',
      required: ['duration_days', 'plan', 'sku_id', 'user_id'],
    })
    const grantRoute = doc.paths['/api/v1/membership-grants']!.post!
    const response = grantRoute.responses['201'] as OpenApiResponse
    const responseSchema = response.content!['application/json'].schema
    const variants = responseSchema.anyOf?.map(variant => ({
      membership: variant.properties?.membership?.type,
      queued: variant.properties?.queued?.const,
    }))
    expect(variants).toEqual(
      expect.arrayContaining([
        { membership: 'object', queued: false },
        { membership: 'null', queued: true },
      ]),
    )
  })

  it('requires an auditable note when granting an identity verification retry', () => {
    const schema =
      doc.paths['/api/v1/admin/users/{userId}/identity-verification-attempts']!.post!.requestBody!
        .content['application/json'].schema
    expect(schema).toMatchObject({ type: 'object', required: ['note'] })
  })

  it('spot-checks non-200 status codes for known routes', () => {
    expect(doc.paths['/api/v1/communities']!.post!.responses).toHaveProperty('201')
  })

  it('documents the complete top-hashtags query contract', () => {
    expect(doc.paths['/api/v1/topic-recommendations/top-hashtags']!.get!.parameters).toEqual([
      {
        in: 'query',
        name: 'after',
        required: false,
        schema: { type: 'string' },
      },
      {
        in: 'query',
        name: 'limit',
        required: false,
        schema: { default: 25, maximum: 100, minimum: 1, type: 'integer' },
      },
      {
        in: 'query',
        name: 'mapping',
        required: false,
        schema: { enum: ['all', 'linked', 'unlinked'], type: 'string' },
      },
      {
        in: 'query',
        name: 'q',
        required: false,
        schema: { type: 'string' },
      },
    ])
  })

  it('publishes refundable charge amounts with the six-code Money currency enum', () => {
    const refundableCharge = doc.components.schemas.RefundableCharge

    expect(refundableCharge.properties?.amount).toEqual({
      $ref: '#/components/schemas/Money',
    })
    expect(refundableCharge.properties?.amount_refunded).toEqual({
      $ref: '#/components/schemas/Money',
    })
    expect(doc.components.schemas.Money.properties?.currency).toEqual({
      enum: ['aud', 'cad', 'eur', 'gbp', 'jpy', 'usd'],
      type: 'string',
    })
  })

  it('documents real post creation, multi-format export, SSE, and registered-route completeness', () => {
    const createPost = doc.paths['/api/v1/posts']!.post!.responses['201'] as {
      content: Record<string, { schema: { anyOf?: unknown[] } }>
    }
    expect(createPost.content['application/json']!.schema.anyOf).toHaveLength(2)
    expect(JSON.stringify(createPost)).toContain('created_by_id')

    const rssExport = doc.paths['/api/v1/my/export/rss-feeds']!.get!.responses[
      '200'
    ] as OpenApiResponse
    expect(Object.keys(rssExport.content!).toSorted()).toEqual([
      'application/json',
      'application/xml',
      'text/csv',
    ])

    const queueStream = doc.paths['/api/v1/mq/stream']!.get!
    expect(queueStream.responses['200']).toMatchObject({
      content: { 'text/event-stream': { schema: {} } },
    })
    expect(doc.paths['/api/v1/mcp']!.get!.responses['405']).toEqual({
      $ref: '#/components/responses/Error',
    })
    expect(doc.paths['/api/v1/mcp']!.post!.responses).toEqual({
      default: { $ref: '#/components/responses/Error' },
    })
    for (const path of ['/api/v1/hostnames', '/api/v1/rss-feeds', '/api/v1/search']) {
      expect(doc.paths[path]!.get!.responses['200']).toMatchObject({
        'x-schema-unavailable': true,
      })
    }

    const registered = new Set(
      loadRegisteredRouteCatalog().map(
        route => `${route.method}:${routeShape(route.routeTemplate)}`,
      ),
    )
    const generated = new Set(
      Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map(
          method => `${method.toUpperCase()}:${path.replace(/\{[^/]+\}/g, ':')}`,
        ),
      ),
    )
    expect({
      missing: [...registered].filter(route => !generated.has(route)).toSorted(),
      extra: [...generated].filter(route => !registered.has(route)).toSorted(),
    }).toEqual({ missing: [], extra: [] })
  })

  it(
    'validates as a structurally sound OpenAPI 3.1 document',
    async () => {
      // `--extends minimal` scopes redocly to spec-validity rules (resolvable refs, valid
      // structure), skipping documentation-completeness rules like `operation-summary` that Phase
      // A intentionally doesn't populate (no hand-authored per-operation prose yet).
      await expect(
        run('pnpm', ['exec', 'redocly', 'lint', openApiPaths.openApiPath, '--extends', 'minimal'], {
          cwd: repoRoot,
        }),
      ).resolves.toBeTruthy()
    },
    COLD_OPENAPI_BUILD_TIMEOUT_MS,
  )

  it('never re-enters loadBackendProgram() beyond the hoist and the known rebuilds', () => {
    // Each writeOpenApi() call rebuilds the document via 5 independent loaders (response, request,
    // query, route catalog, header), each entering loadBackendProgram() once — 10 entries for the two
    // legitimate rebuilds above, plus 1 for the direct loadRegisteredRouteCatalog() call in
    // 'documents real post creation...'. Any other reintroduced call trips this, even one that hits
    // a warm cache, unlike a build-count-only assertion.
    expect(getBackendProgramEntryCount()).toBe(entryCountAfterHoist + 11)
    expect(getBackendProgramBuildCount()).toBe(buildCountAfterHoist)
  })
})
