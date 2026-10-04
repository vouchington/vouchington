import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { requiredFlagsForProperty } from './native-moderation-optional-contracts.mts'
import type { buildApiFixtureManifest } from './write.mts'

describe('native moderation optional additive contracts', () => {
  const { backendResponseContracts: contracts } = JSON.parse(
    readFileSync(new URL('../../../api-fixtures/v1/manifest.json', import.meta.url), 'utf8'),
  ) as ReturnType<typeof buildApiFixtureManifest>

  it('keeps current appeal and dispute context optional and review media required', () => {
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
      requiredFlagsForProperty(contracts['GET:/api/v1/posts/review-queue'].schema, 'media_reveal'),
    ).toEqual([true])
  })
})
