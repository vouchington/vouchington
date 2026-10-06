import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'
import { buildAdminResponseContracts } from './admin-response-contracts.mts'
import { writeRequestContracts, requestContractPaths } from './write-request-contracts.mts'

const bundle = JSON.parse(readFileSync(requestContractPaths.requestContractsPath, 'utf8'))
const document = {
  openapi: '3.1.0',
  info: { title: 'internal', version: '1' },
  components: { schemas: { Input: { type: 'object', properties: { name: { type: 'string' } } } } },
  paths: {
    '/example': {
      post: {
        responses: {},
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Input' } },
          },
        },
      },
    },
  },
} as unknown as OpenApiDocument

describe('runtime request contract writer', () => {
  it('writes only the runtime bundle and checks its canonical serialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'request-contracts-write-'))
    const path = join(root, 'request-contracts.json')
    await writeRequestContracts({ path, document })
    expect(await readdir(root)).toEqual(['request-contracts.json'])
    const output = JSON.parse(await readFile(path, 'utf8'))
    expect(output).toMatchObject({
      version: 1,
      source: 'compiler-extracted-request-contracts',
      operations: { 'POST:/example': { body: { $ref: '#/components/schemas/Input' } } },
      adminResponses: {},
    })
    expect(output).not.toHaveProperty('openapi')
    await expect(writeRequestContracts({ check: true, path, document })).resolves.toBeUndefined()
    const before = await readFile(path, 'utf8')
    await expect(
      writeRequestContracts({
        check: true,
        path,
        document: {
          ...document,
          components: { ...document.components, schemas: {} },
        },
      }),
    ).rejects.toThrow('Runtime request contracts are stale')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('retains staff inline and non-200 response selection without adding request coverage', () => {
    const staff = {
      ...document,
      paths: {
        '/api/v1/admin/warnings': {
          post: {
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { created: { const: true } } },
                  },
                },
              },
              '202': {
                description: 'Accepted',
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    } as unknown as OpenApiDocument
    expect(buildAdminResponseContracts(staff)).toEqual({
      'POST:/api/v1/admin/warnings': { type: 'object', properties: { created: { const: true } } },
    })
    expect(buildRequestContractsBundle(staff).operations).toEqual({})
    expect(bundle.adminResponses['GET:/api/v1/admin/modlog']).toBeDefined()
  })

  it('retains request bodies, required query carriers and money components used at runtime', () => {
    expect(bundle.operations['POST:/api/v1/auth/bluesky/link'].body).toEqual({
      $ref: '#/components/schemas/BeginBlueskyLinkRequest',
    })
    expect(bundle.operations['GET:/api/v1/localization'].query).toMatchObject({
      required: ['consumer'],
    })
    expect(bundle.components.LogoutRequest).toMatchObject({
      required: ['web_push_endpoint', 'web_push_subscription_id'],
    })
    expect(bundle.components.Money.properties.currency).toEqual({
      enum: ['aud', 'cad', 'eur', 'gbp', 'jpy', 'usd'],
      type: 'string',
    })
  })
})
