import { describe, expect, it } from 'vitest'

import {
  makeAttemptEnv,
  storybookBrowserAttemptCacheDir,
  vitestArgs,
} from './storybook-browser-runner-env.mts'

describe('makeAttemptEnv', () => {
  it('sets Storybook browser coverage, debug, cache, and API port env vars', () => {
    const env = makeAttemptEnv(
      {
        DEBUG: 'storybook',
        GITHUB_JOB: 'storybook',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '27519989871',
        RUNNER_TEMP: '/runner-temp',
      },
      2,
      '/repo',
    )

    expect(env.DEBUG).toBe(
      'storybook,-pw:protocol*,vitest:browser:playwright,vitest:browser:api,vite:deps',
    )
    expect(env.VITEST_COVERAGE_SCOPE).toBe('web-storybook-browser')
    expect(env.VITEST_PW_DEBUG).toBe('1')
    expect(env.VITEST_STORYBOOK_BROWSER).toBe('1')
    expect(env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2',
    )
    expect(env.VITEST_STORYBOOK_BROWSER_API_PORT).toMatch(/^\d+$/)
  })

  it('uses node_modules for local attempt caches', () => {
    const env = makeAttemptEnv({}, 1, '/repo')

    expect(env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/node_modules/.vite/storybook-browser-attempt-1',
    )
  })

  it('falls back to TMPDIR when CI RUNNER_TEMP is blank', () => {
    const env = makeAttemptEnv(
      {
        CI: 'true',
        GITHUB_JOB: 'storybook',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '27519989871',
        RUNNER_TEMP: '',
        TMPDIR: '/system-temp',
      },
      1,
      '/repo',
    )

    expect(env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/system-temp/vite-storybook-browser-27519989871-1-storybook-attempt-1',
    )
  })

  it('respects an explicit browser API port while offsetting retry attempts', () => {
    const firstAttempt = makeAttemptEnv({ VITEST_STORYBOOK_BROWSER_API_PORT: '49231' }, 1, '/repo')
    const secondAttempt = makeAttemptEnv({ VITEST_STORYBOOK_BROWSER_API_PORT: '49231' }, 2, '/repo')

    expect(firstAttempt.VITEST_STORYBOOK_BROWSER_API_PORT).toBe('49231')
    expect(secondAttempt.VITEST_STORYBOOK_BROWSER_API_PORT).toBe('49368')
  })

  it('adds bounded Playwright browser lifecycle debug after a startup hang', () => {
    const env = makeAttemptEnv({ DEBUG: 'storybook' }, 2, '/repo', true)

    expect(env.DEBUG).toBe(
      'storybook,-pw:protocol*,vitest:browser:playwright,vitest:browser:api,pw:browser*,vite:deps',
    )
    expect(env.DEBUG?.split(',')).not.toContain('pw:protocol')
  })

  it('does not add verbose Playwright browser debug on a normal attempt', () => {
    const env = makeAttemptEnv({ DEBUG: 'storybook' }, 1, '/repo', false)

    expect(env.DEBUG).toBe(
      'storybook,-pw:protocol*,vitest:browser:playwright,vitest:browser:api,vite:deps',
    )
    expect(env.DEBUG).not.toContain('pw:browser*')
  })

  it('does not add verbose Playwright browser debug when priorHang is omitted', () => {
    const env = makeAttemptEnv({ DEBUG: 'storybook' }, 1, '/repo')

    expect(env.DEBUG).toBe(
      'storybook,-pw:protocol*,vitest:browser:playwright,vitest:browser:api,vite:deps',
    )
    expect(env.DEBUG).not.toContain('pw:browser*')
  })

  it('removes unbounded Playwright protocol debug requested by the parent environment', () => {
    const env = makeAttemptEnv({ DEBUG: 'storybook,pw:protocol,pw:protocol*' }, 1, '/repo')

    expect(env.DEBUG).toBe(
      'storybook,-pw:protocol*,vitest:browser:playwright,vitest:browser:api,vite:deps',
    )
  })

  it.each(['*', 'pw:*'])('explicitly excludes raw protocol traffic from DEBUG=%s', inherited => {
    const env = makeAttemptEnv({ DEBUG: inherited }, 1, '/repo')

    expect(env.DEBUG).toContain(inherited)
    expect(env.DEBUG).toContain('-pw:protocol*')
  })

  it('derives attempt cache dirs independently from explicit cache overrides', () => {
    const cacheDir = storybookBrowserAttemptCacheDir(
      {
        CI: 'true',
        GITHUB_JOB: 'storybook',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '27519989871',
        RUNNER_TEMP: '/runner-temp',
        VITEST_STORYBOOK_BROWSER_CACHE_DIR: '/repo/.cache/vite/storybook-browser',
      },
      2,
      '/repo',
    )

    expect(cacheDir).toBe('/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2')
  })
})

describe('vitestArgs', () => {
  it('runs the full project with coverage by default', () => {
    expect(vitestArgs({})).toEqual([
      'exec',
      './ci/with-node-test-options',
      'vitest',
      'run',
      '--bail=3',
      '--project',
      'web-storybook-browser',
      '--coverage',
    ])
  })

  it('omits --coverage when STORYBOOK_BROWSER_COVERAGE is 0', () => {
    expect(vitestArgs({ STORYBOOK_BROWSER_COVERAGE: '0' })).not.toContain('--coverage')
  })
})
