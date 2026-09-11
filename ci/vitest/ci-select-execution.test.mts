import { describe, expect, it } from 'vitest'

import {
  shardedJobOutcome,
  SIDE_DUTY_JOBS,
  shouldSkipJob,
  storybookBrowserSelection,
} from './ci-select.mts'

describe('targeted workflow execution', () => {
  it('retains workflows with non-Vitest side duties when their test selection is empty', () => {
    expect(SIDE_DUTY_JOBS).toEqual(new Set(['test-postgres-schema']))
    for (const job of SIDE_DUTY_JOBS) expect(shouldSkipJob(job, false)).toBe(false)
    expect(shouldSkipJob('test-tooling', false)).toBe(true)
    expect(shouldSkipJob('test-web', false)).toBe(true)
    expect(shouldSkipJob('test-web', true)).toBe(false)
    expect(shouldSkipJob('test-backend-unit', false)).toBe(true)
    for (const job of ['test-backend-modules', 'test-cloudflare-worker', 'test-lambdas']) {
      expect(shouldSkipJob(job, false)).toBe(true)
      expect(shouldSkipJob(job, true)).toBe(false)
    }
  })

  it('clears narrowed Storybook browser files when Storybook is forced full', () => {
    expect(storybookBrowserSelection(['web/storybook/button.stories.tsx'], true)).toEqual({
      mode: 'full',
      files: [],
    })
    expect(storybookBrowserSelection(['web/storybook/button.stories.tsx'], false)).toEqual({
      mode: 'selected',
      files: ['web/storybook/button.stories.tsx'],
    })
  })

  it('whole-skips an explicit empty sharded selection and expects no coverage shards', () => {
    expect(shardedJobOutcome(false, 1, 4)).toEqual({ skip: true, coverageShards: 0 })
  })

  it('runs selected and forced-full sharded selections with their resolved shard totals', () => {
    expect(shardedJobOutcome(true, 2, 4)).toEqual({ skip: false, coverageShards: 2 })
    expect(shardedJobOutcome(true, 5, 4)).toEqual({ skip: false, coverageShards: 5 })
  })

  it('fails open to the configured shard total when execution state is missing', () => {
    expect(shardedJobOutcome(undefined, undefined, 4)).toEqual({
      skip: false,
      coverageShards: 4,
    })
  })
})
