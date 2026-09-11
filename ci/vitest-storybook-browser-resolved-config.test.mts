import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { storybookBrowserOptimizeDeps } from '../test-helpers/vitest-config/storybook-browser-optimize-deps.mts'

type ResolvedConfig = {
  apiPort?: number
  connectTimeout?: number
  exclude?: string[]
  include?: string[]
  providerOptions?: { launchOptions?: { channel?: string } }
}
const resolvedConfigMarker = '__RESOLVED_STORYBOOK_CONFIG__'

describe('resolved Storybook browser Vitest config', () => {
  it('installs the browser dependency catalog without bundling next/image', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'storybook-browser-config-test-'))
    let output: string
    try {
      output = execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--input-type=module',
          '--eval',
          `const { createVitest } = await import('vitest/node')
const context = await createVitest('test', {
  config: './vitest.config.mts',
  project: 'web-storybook-browser',
  watch: false,
})
let payload
try {
  const project = context.projects.find(candidate => candidate.name.startsWith('web-storybook-browser'))
  const optimizeDeps = project?.vite.config.optimizeDeps
  payload = JSON.stringify({
    apiPort: project?.config.api.port,
    connectTimeout: project?.config.browser.connectTimeout,
    exclude: optimizeDeps?.exclude,
    include: optimizeDeps?.include,
    providerOptions: project?.config.browser.provider.options,
  })
} finally {
  await context.close()
}
process.stdout.write('\\n${resolvedConfigMarker}' + payload)`,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          maxBuffer: 1_048_576,
          timeout: 30_000,
          env: {
            ...process.env,
            STORYBOOK_BROWSER_HANG_MS: '120000',
            VITEST_STORYBOOK_BROWSER: '1',
            VITEST_STORYBOOK_BROWSER_API_PORT: '49991',
            VITEST_STORYBOOK_BROWSER_CACHE_DIR: cacheDir,
          },
        },
      )
    } finally {
      rmSync(cacheDir, { force: true, recursive: true })
    }
    const markerIndex = output.lastIndexOf(resolvedConfigMarker)
    expect(markerIndex).toBeGreaterThanOrEqual(0)
    const resolved = JSON.parse(
      output.slice(markerIndex + resolvedConfigMarker.length),
    ) as ResolvedConfig

    expect(resolved.apiPort).toBe(49_991)
    expect(resolved.connectTimeout).toBe(120_000)
    expect(resolved.include).toEqual(expect.arrayContaining([...storybookBrowserOptimizeDeps]))
    expect(resolved.include).toContain('react')
    expect(
      resolved.include?.filter(value => value === storybookBrowserOptimizeDeps.at(-1)),
    ).toHaveLength(1)
    expect(resolved.include).not.toContain('next/image')
    expect(resolved.exclude?.filter(value => value === 'next/image')).toHaveLength(1)
    expect(resolved.providerOptions?.launchOptions?.channel).toBe('chromium')
  })
})
