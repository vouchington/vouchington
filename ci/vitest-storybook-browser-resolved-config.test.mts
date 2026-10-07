import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestProjectInlineConfiguration } from 'vitest/config'

import { storybookBrowserOptimizeDeps } from '../test-helpers/vitest-config/storybook-browser-optimize-deps.mts'

describe('resolved Storybook browser Vitest config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('installs the browser dependency catalog without bundling next/image', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'storybook-browser-config-test-'))
    try {
      const configFile = join(fixtureRoot, 'vite.config.mjs')
      writeFileSync(
        configFile,
        `export default ${JSON.stringify({
          optimizeDeps: {
            include: ['react', 'next/image', storybookBrowserOptimizeDeps.at(-1)],
            exclude: ['next/image', 'next/headers'],
          },
        })}`,
      )
      vi.stubEnv('VITEST_STORYBOOK_BROWSER', '1')
      vi.stubEnv('STORYBOOK_BROWSER_HANG_MS', '120000')
      vi.stubEnv('VITEST_STORYBOOK_BROWSER_API_PORT', '49991')
      vi.stubEnv('VITEST_STORYBOOK_BROWSER_CACHE_DIR', join(fixtureRoot, 'cache'))
      vi.resetModules()

      const { storybookBrowserProject } =
        await import('../test-helpers/vitest-config/storybook-browser-project.mts')
      const project = storybookBrowserProject as TestProjectInlineConfiguration
      const resetBasePlugin = project.plugins?.find(
        plugin =>
          plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'reset-base',
      )
      expect(resetBasePlugin).toBeDefined()
      if (!resetBasePlugin) throw new Error('Missing Storybook browser dependency plugin')

      // Vitest owns Vite here; use its copy without changing the CI workspace manifest.
      const require = createRequire(import.meta.url)
      const vitestRequire = createRequire(require.resolve('vitest/node'))
      const vite = await import(pathToFileURL(vitestRequire.resolve('vite')).href)
      const resolved = (await vite.resolveConfig(
        { root: fixtureRoot, configFile, plugins: [resetBasePlugin] },
        'serve',
      )) as { optimizeDeps: { include?: string[]; exclude?: string[] } }

      expect(project.test).toMatchObject({
        api: { port: 49_991 },
        browser: {
          connectTimeout: 120_000,
          provider: { options: { launchOptions: { channel: 'chromium' } } },
        },
      })
      expect(resolved.optimizeDeps.include).toEqual(
        expect.arrayContaining([...new Set(storybookBrowserOptimizeDeps)]),
      )
      expect(resolved.optimizeDeps.include).toContain('react')
      expect(
        resolved.optimizeDeps.include?.filter(
          value => value === storybookBrowserOptimizeDeps.at(-1),
        ),
      ).toHaveLength(1)
      expect(resolved.optimizeDeps.include).not.toContain('next/image')
      expect(resolved.optimizeDeps.include).not.toContain('next/headers')
      expect(resolved.optimizeDeps.exclude?.filter(value => value === 'next/image')).toHaveLength(1)
      expect(resolved.optimizeDeps.exclude?.filter(value => value === 'next/headers')).toHaveLength(
        1,
      )
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true })
    }
  })
})
