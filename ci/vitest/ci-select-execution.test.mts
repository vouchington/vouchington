import { describe, expect, it } from 'vitest'

import { SIDE_DUTY_JOBS, shouldSkipJob, storybookBrowserSelection } from './ci-select.mts'

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
})
