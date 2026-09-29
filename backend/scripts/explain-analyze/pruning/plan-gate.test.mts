import { describe, expect, it } from 'vitest'
import { assertExecutingPrunedLeaves } from './plan-gate.mts'

describe('isolated partition pruning gate', () => {
  const allLeaves = ['ratings__2024', 'ratings__2025', 'ratings__default']
  const scan = (name: string, loops = 1) => ({
    'Node Type': 'Index Scan',
    'Relation Name': name,
    'Actual Loops': loops,
  })
  const input = (plans: ReturnType<typeof scan>[], expectedLeaves: string[]) => ({
    label: 'review:2024',
    parent: 'ratings',
    allLeaves,
    expectedLeaves,
    plan: { Plan: { 'Node Type': 'Append', Plans: plans } },
  })

  it('accepts only the expected executed range leaf for a single target', () => {
    expect(assertExecutingPrunedLeaves(input([scan('ratings__2024')], ['ratings__2024']))).toEqual([
      'ratings__2024',
    ])
  })
  it('accepts both range leaves for a two-target vote refresh', () => {
    expect(
      assertExecutingPrunedLeaves(
        input([scan('ratings__2025'), scan('ratings__2024')], ['ratings__2024', 'ratings__2025']),
      ),
    ).toEqual(['ratings__2024', 'ratings__2025'])
  })
  it('rejects a default, sibling, or unpruned list child with actual loops', () => {
    expect(() =>
      assertExecutingPrunedLeaves(
        input([scan('ratings__2024'), scan('ratings__default')], ['ratings__2024']),
      ),
    ).toThrow(/executed leaves/)
    expect(() =>
      assertExecutingPrunedLeaves(
        input([scan('ratings__2024'), scan('ratings__2025')], ['ratings__2024']),
      ),
    ).toThrow(/executed leaves/)
  })
  it('rejects missing target work and ignores zero-loop branches', () => {
    expect(() => assertExecutingPrunedLeaves(input([], ['ratings__2024']))).toThrow(
      /executed leaves/,
    )
    expect(
      assertExecutingPrunedLeaves(
        input([scan('ratings__2024'), scan('ratings__default', 0)], ['ratings__2024']),
      ),
    ).toEqual(['ratings__2024'])
  })
})
