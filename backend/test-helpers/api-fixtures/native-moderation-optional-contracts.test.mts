import { beforeAll, describe, expect, it } from 'vitest'
import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { requiredFlagsForProperty } from './native-moderation-optional-contracts.mts'
import { buildApiFixtureManifest } from './write.mts'

describe('native moderation optional additive contracts', () => {
  let contracts: ReturnType<typeof buildApiFixtureManifest>['backendResponseContracts']

  beforeAll(() => {
    contracts = buildApiFixtureManifest().backendResponseContracts
  }, COLD_BACKEND_PROGRAM_TIMEOUT_MS)

  it('keeps appeal, dispute, and review-media additions optional for old backends', () => {
    expect(
      requiredFlagsForProperty(contracts['GET:/api/v1/appeals#staff'].schema, 'target_context'),
    ).toEqual([false])
    expect(
      requiredFlagsForProperty(contracts['GET:/api/v1/appeals#staff'].schema, 'staff_context'),
    ).toEqual([false])
    expect(
      requiredFlagsForProperty(contracts['GET:/api/v1/disputes#staff'].schema, 'staff_context'),
    ).toEqual([false])
    expect(
      requiredFlagsForProperty(contracts['GET:/api/v1/posts/review-queue'].schema, 'media_context'),
    ).toEqual([false])
  })
})
