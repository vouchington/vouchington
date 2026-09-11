import { describe, expect, it } from 'vitest'

import { validateFixtureContracts } from './fixture-contract-validation.mts'
import type { BackendResponseContract } from './response-contract-types.mts'
import type { ResolvedApiFixtureCase } from './types.mts'

describe('API fixture backend contract validation', () => {
  it('validates fixture statuses against exact backend response variants', () => {
    const contracts = {
      'POST:/api/v1/imports/crm-contacts#success': contract(
        'POST',
        '/api/v1/imports/crm-contacts',
        [201],
      ),
      'POST:/api/v1/imports/crm-contacts#validation': contract(
        'POST',
        '/api/v1/imports/crm-contacts',
        [422],
      ),
    }
    const success = fixture(
      'crm.success',
      'POST:/api/v1/imports/crm-contacts#success',
      '/api/v1/imports/crm-contacts',
      201,
    )
    const validation = fixture(
      'crm.validation',
      'POST:/api/v1/imports/crm-contacts#validation',
      '/api/v1/imports/crm-contacts',
      422,
    )

    expect(() => validateFixtureContracts([success, validation], contracts)).not.toThrow()
    expect(() =>
      validateFixtureContracts(
        [
          { ...success, status: 422 },
          { ...validation, status: 201 },
        ],
        contracts,
      ),
    ).toThrowError(
      [
        'Fixture contract validation failed:',
        'crm.success: status 422 is not declared by response contract "POST:/api/v1/imports/crm-contacts#success" (POST:/api/v1/imports/crm-contacts); available statuses: 201',
        'crm.validation: status 201 is not declared by response contract "POST:/api/v1/imports/crm-contacts#validation" (POST:/api/v1/imports/crm-contacts); available statuses: 422',
      ].join('\n'),
    )
  })

  it('aggregates create and delete status mismatches deterministically', () => {
    const create = fixture('widgets.create', 'POST:/api/v1/widgets', '/api/v1/widgets', 200)
    const remove = {
      ...fixture(
        'widgets.delete',
        'DELETE:/api/v1/widgets/:widgetId',
        '/api/v1/widgets/:id',
        200,
        'DELETE',
      ),
      body: null,
    }
    const deleteContract: BackendResponseContract = {
      ...contract('DELETE', '/api/v1/widgets/:widgetId', [204]),
      bodyKind: 'none',
      schema: { root: { type: 'null' }, definitions: {} },
    }

    expect(() =>
      validateFixtureContracts([create, remove], {
        'POST:/api/v1/widgets': contract('POST', '/api/v1/widgets', [201]),
        'DELETE:/api/v1/widgets/:widgetId': deleteContract,
      }),
    ).toThrowError(
      [
        'Fixture contract validation failed:',
        'widgets.create: status 200 is not declared by response contract "POST:/api/v1/widgets" (POST:/api/v1/widgets); available statuses: 201',
        'widgets.delete: status 200 is not declared by response contract "DELETE:/api/v1/widgets/:widgetId" (DELETE:/api/v1/widgets/:widgetId); available statuses: 204',
      ].join('\n'),
    )
  })

  it('accepts route parameter aliases and rejects a binding to another operation', () => {
    const aliasedContract = contract('GET', '/api/v1/widgets/:widgetId', [200])
    const contracts = {
      'GET:/api/v1/widgets/:widgetId': {
        ...contract('GET', '/api/v1/widgets/:widgetId', [201]),
        schema: { root: { type: 'string' } as const, definitions: {} },
      },
      'POST:/api/v1/widgets': contract('POST', '/api/v1/widgets', [200]),
    }
    const aliasedParam = fixture(
      'widgets.show',
      'GET:/api/v1/widgets/:widgetId',
      '/api/v1/widgets/:id',
      200,
      'GET',
    )
    expect(() =>
      validateFixtureContracts([aliasedParam], {
        'GET:/api/v1/widgets/:widgetId': aliasedContract,
      }),
    ).not.toThrow()

    const wrongBinding = fixture(
      'widgets.create',
      'GET:/api/v1/widgets/:widgetId',
      '/api/v1/widgets',
      200,
    )
    expect(() => validateFixtureContracts([wrongBinding], contracts)).toThrowError(
      [
        'Fixture contract validation failed:',
        'widgets.create: fixture operation POST:/api/v1/widgets does not match response contract "GET:/api/v1/widgets/:widgetId" (GET:/api/v1/widgets/:widgetId)',
        'Response contract "POST:/api/v1/widgets" is not used by a fixture',
      ].join('\n'),
    )
  })
})

function contract(
  method: string,
  routeTemplate: string,
  statusCodes: readonly [number, ...number[]],
): BackendResponseContract {
  return {
    method,
    routeTemplate,
    statusCodes,
    statusKnowledge: 'explicit',
    source: 'test',
    hash: `${method}:${routeTemplate}`,
    schema: {
      root: { type: 'object', properties: {}, additionalProperties: false },
      definitions: {},
    },
  }
}

function fixture(
  id: string,
  backendResponseContractKey: string,
  routeTemplate: string,
  status: number,
  method: ResolvedApiFixtureCase['method'] = 'POST',
): Pick<
  ResolvedApiFixtureCase,
  'id' | 'method' | 'route' | 'status' | 'body' | 'backendResponseContractKey'
> {
  return {
    id,
    method,
    route: { routeTemplate },
    status,
    body: {},
    backendResponseContractKey,
  }
}
