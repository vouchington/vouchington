import { describe, expect, it } from 'vitest'

import type { BackendQueryContractRegistry } from './query-contract-types.mts'
import { withRequiredQueryParameters } from './required-query-parameters.mts'

const operation = 'GET:/api/v1/localization'

describe('required product query parameters', () => {
  it('adds requiredness without mutating the discovered catalog or losing descriptor fields', () => {
    const input = {
      [operation]: {
        method: 'GET',
        routeTemplate: '/api/v1/localization',
        parameters: {
          consumer: { kind: 'enum', values: ['web', 'native'], description: 'Client' },
        },
      },
    } satisfies BackendQueryContractRegistry
    const result = withRequiredQueryParameters(input)
    expect(result[operation]?.parameters.consumer).toEqual({
      kind: 'enum',
      values: ['web', 'native'],
      description: 'Client',
      required: true,
    })
    expect(input[operation].parameters.consumer).not.toHaveProperty('required')
    expect(withRequiredQueryParameters(result)).toEqual(result)
  })

  it('preserves unrelated descriptors and accepts absent override operations', () => {
    const input = {
      'GET:/unrelated': {
        method: 'GET',
        routeTemplate: '/unrelated',
        parameters: { all: { kind: 'boolean' } },
      },
    } satisfies BackendQueryContractRegistry
    expect(withRequiredQueryParameters(input)).toEqual(input)
  })

  it('rejects an override whose operation lost the required parameter', () => {
    expect(() =>
      withRequiredQueryParameters({
        [operation]: { method: 'GET', routeTemplate: '/api/v1/localization', parameters: {} },
      }),
    ).toThrow(`Required query parameter ${operation} consumer is missing`)
  })
})
