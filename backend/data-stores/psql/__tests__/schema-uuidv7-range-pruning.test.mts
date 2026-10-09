import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { withCanonicalUuidv7Pruning } from '../../../test-helpers/uuidv7-partition-pruning.mts'

function collectRelationNames(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectRelationNames(item, names)
    return names
  }
  if (value === null || typeof value !== 'object') return names
  for (const [key, child] of Object.entries(value)) {
    if (key === 'Relation Name' && typeof child === 'string') names.add(child)
    collectRelationNames(child, names)
  }
  return names
}

describe('UUIDv7 range partition pruning', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'prunes point and bounded-range queries with %s',
    async planCacheMode => {
      await withCanonicalUuidv7Pruning(planCacheMode, evidence => {
        expect([...collectRelationNames(evidence.pointPlan)].toSorted()).toEqual(
          evidence.pointRelations,
        )
        expect([...collectRelationNames(evidence.rangePlan)].toSorted()).toEqual(
          evidence.rangeRelations,
        )
        expect(evidence.pointIds).toEqual(evidence.expectedPoint)
        expect(evidence.rangeIds).toEqual(evidence.expectedRange)
      })
    },
  )
})
