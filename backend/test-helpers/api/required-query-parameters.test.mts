import { describe, expect, it } from 'vitest'

import { queryString, requiredQueryEnum } from '@modules/pagination'
import type { BackendResponseContract } from '../api-fixtures/response-contract-types.mts'
import { buildOpenApiDocument } from '../api-fixtures/openapi/build-openapi-document.mts'

describe('required query projection', () => {
  it('requires the source-marked enum on a dynamic route without requiring optional peers', () => {
    const route = '/api/v1/things/:id'
    const key = `GET:${route}`
    const response: BackendResponseContract = {
      method: 'GET',
      routeTemplate: route,
      source: 'synthetic-route',
      hash: 'synthetic-hash',
      schema: { root: { type: 'unknown' }, definitions: {} },
    }
    const document = buildOpenApiDocument(
      { [key]: response },
      {},
      {
        [key]: {
          method: 'GET',
          routeTemplate: route,
          parameters: { consumer: requiredQueryEnum(['web', 'swift']), detail: queryString() },
        },
      },
    )
    const parameters = document.paths['/api/v1/things/{id}']!.get!.parameters!

    expect(parameters).toContainEqual(
      expect.objectContaining({ in: 'query', name: 'consumer', required: true }),
    )
    expect(parameters).toContainEqual(
      expect.objectContaining({ in: 'query', name: 'detail', required: false }),
    )
  })
})
