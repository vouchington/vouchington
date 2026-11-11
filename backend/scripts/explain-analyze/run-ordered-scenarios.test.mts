import { describe, expect, it } from 'vitest'
import { ORDINARY_EXPLAIN_SHARDS } from './explain-shards.mts'
import {
  BEFORE_PARTITION_RUNNERS,
  ORDERED_SHARD_STARTS,
  getOrderedRunners,
  sliceOrderedRunners,
} from './run-ordered-scenarios.mts'

const names = ['one', 'two', 'three', 'four', 'five']
const runners = names.map(name => ({ [name]: async () => name })[name]!)

describe('sliceOrderedRunners', () => {
  it('cuts contiguous segments that keep every runner once, in order', () => {
    const segments = sliceOrderedRunners(runners, ['three', 'five'])
    expect(segments.map(segment => segment.map(runner => runner.name))).toEqual([
      ['one', 'two'],
      ['three', 'four'],
      ['five'],
    ])
  })

  it('rejects a start that is absent or comes before the previous start', () => {
    expect(() => sliceOrderedRunners(runners, ['ghost'])).toThrow('ghost is missing')
    expect(() => sliceOrderedRunners(runners, ['four', 'two'])).toThrow('two is missing')
    expect(() => sliceOrderedRunners(runners, ['one'])).toThrow('one is missing')
  })
})

describe('getOrderedRunners', () => {
  it('gives each ordinary shard one segment and an unsharded run all of them in order', () => {
    const segments = ORDINARY_EXPLAIN_SHARDS.map(shard => getOrderedRunners(shard))
    for (const segment of segments) expect(segment.length).toBeGreaterThan(0)
    expect(segments.flat()).toEqual(BEFORE_PARTITION_RUNNERS)
    expect(getOrderedRunners(undefined)).toEqual(BEFORE_PARTITION_RUNNERS)
    expect(new Set(BEFORE_PARTITION_RUNNERS.map(runner => runner.name)).size).toBe(
      BEFORE_PARTITION_RUNNERS.length,
    )
  })

  it('opens each later ordinary shard with its declared start runner', () => {
    expect(
      ORDINARY_EXPLAIN_SHARDS.slice(1).map(shard => getOrderedRunners(shard)[0]?.name),
    ).toEqual([...ORDERED_SHARD_STARTS])
  })
})
