import { afterEach, describe, expect, it } from 'vitest'

import {
  getBackendProgramBuildCount,
  simulateBackendProgramBuildTimeInputChangeForTest,
  simulateBackendProgramInputChangeForTest,
} from './backend-program.mts'
import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS } from './backend-program-settlement.mts'
import { loadBackendQueryContracts } from './query-contract-registry.mts'
import { loadRegisteredRouteCatalog } from './registered-route-catalog.mts'
import { loadBackendRequestContracts } from './request-contract-registry.mts'
import { resetBackendContractDiscoveryCachesForTest } from './reset-backend-contract-caches-for-test.mts'
import { loadBackendResponseContracts } from './response-contract-registry.mts'

describe('loadBackendProgram build count', () => {
  afterEach(() => {
    resetBackendContractDiscoveryCachesForTest()
  })

  it(
    'settles and rebuilds every loader cache across two backend-program generations',
    () => {
      resetBackendContractDiscoveryCachesForTest()
      expect(getBackendProgramBuildCount()).toBe(0)

      const firstResponses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const firstRequests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const firstQueries = loadBackendQueryContracts(new Set(Object.keys(firstResponses)))
      const firstCatalog = loadRegisteredRouteCatalog()
      const settledBuildCount = getBackendProgramBuildCount()
      expect(settledBuildCount).toBeGreaterThanOrEqual(1)
      expect(settledBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)

      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(
        firstResponses,
      )
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(firstRequests)
      expect(loadBackendQueryContracts(new Set(Object.keys(firstResponses)))).toBe(firstQueries)
      expect(loadRegisteredRouteCatalog()).toBe(firstCatalog)
      expect(getBackendProgramBuildCount()).toBe(settledBuildCount)

      simulateBackendProgramInputChangeForTest()

      const secondResponses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const secondRequests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const secondQueries = loadBackendQueryContracts(new Set(Object.keys(secondResponses)))
      const secondCatalog = loadRegisteredRouteCatalog()
      const secondBuildCount = getBackendProgramBuildCount()
      const invalidatedBuildCount = secondBuildCount - settledBuildCount

      expect(invalidatedBuildCount).toBeGreaterThanOrEqual(1)
      expect(invalidatedBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)
      expect(secondResponses).not.toBe(firstResponses)
      expect(secondRequests).not.toBe(firstRequests)
      expect(secondQueries).not.toBe(firstQueries)
      expect(secondCatalog).not.toBe(firstCatalog)
      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(
        secondResponses,
      )
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(
        secondRequests,
      )
      expect(loadBackendQueryContracts(new Set(Object.keys(secondResponses)))).toBe(secondQueries)
      expect(loadRegisteredRouteCatalog()).toBe(secondCatalog)
      expect(getBackendProgramBuildCount()).toBe(secondBuildCount)
    },
    COLD_BACKEND_PROGRAM_TIMEOUT_MS * 2,
  )

  it(
    'retries one build-time input change before composing every loader cache',
    () => {
      resetBackendContractDiscoveryCachesForTest()
      simulateBackendProgramBuildTimeInputChangeForTest()
      const responses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const requests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const queries = loadBackendQueryContracts(new Set(Object.keys(responses)))
      const catalog = loadRegisteredRouteCatalog()
      const settledBuildCount = getBackendProgramBuildCount()

      expect(settledBuildCount).toBeGreaterThanOrEqual(2)
      expect(settledBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)
      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(responses)
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(requests)
      expect(loadBackendQueryContracts(new Set(Object.keys(responses)))).toBe(queries)
      expect(loadRegisteredRouteCatalog()).toBe(catalog)
      expect(getBackendProgramBuildCount()).toBe(settledBuildCount)
    },
    COLD_BACKEND_PROGRAM_TIMEOUT_MS * MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS,
  )
})
