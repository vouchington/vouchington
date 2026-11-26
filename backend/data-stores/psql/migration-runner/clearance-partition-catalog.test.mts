import { describe, expect, it } from 'vitest'
import { findMissingClearancePartitions } from './clearance-partition-catalog.mts'

const november = {
  name: 'post_clearance_changes__p_2026_11',
  bound:
    "FOR VALUES FROM ('01a19467-e800-7000-8000-000000000000') TO ('01a22ee6-b000-7000-8000-000000000000')",
}
const december = {
  name: 'post_clearance_changes__p_2026_12',
  bound:
    "FOR VALUES FROM ('01a22ee6-b000-7000-8000-000000000000') TO ('01a2ce8b-d400-7000-8000-000000000000')",
}

describe('clearance partition catalog', () => {
  it('creates only the missing month when the attached month matches', () => {
    expect(
      findMissingClearancePartitions(
        [november, december],
        [{ ...november, detach_pending: false }],
      ),
    ).toEqual([december])
  })

  it('rejects a default child before planning any creation', () => {
    expect(() =>
      findMissingClearancePartitions(
        [november],
        [{ name: 'post_clearance_changes__default', bound: 'DEFAULT', detach_pending: false }],
      ),
    ).toThrow('Unexpected default partition for post_clearance_changes')
  })

  it.each([
    { state: 'a different range', bound: december.bound, detach_pending: false },
    { state: 'a pending detach', bound: november.bound, detach_pending: true },
  ])('rejects a matching name with $state', ({ bound, detach_pending }) => {
    expect(() =>
      findMissingClearancePartitions([november], [{ name: november.name, bound, detach_pending }]),
    ).toThrow(`Unexpected state for post clearance partition ${november.name}`)
  })
})
