import { resolve } from 'node:path'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import type { TestProjectConfiguration } from 'vitest/config'
import {
  isStorybookBrowserEnabled,
  parseStorybookBrowserApiPort,
  parseStorybookBrowserMaxWorkers,
  storybookBrowserCacheDir,
  storybookBrowserConnectionTimeoutMs,
  storybookPreviewApiPath,
} from './environment.mts'
import { storybookMockResolveAliases } from './storybook-browser-aliases.mts'
import { applyStorybookBrowserOptimizeDeps } from './storybook-browser-optimize-deps.mts'

export const webAlias = {
  '@': resolve(process.cwd(), 'web'),
  react: resolve(process.cwd(), 'web/node_modules/react'),
  'react-dom': resolve(process.cwd(), 'web/node_modules/react-dom'),
}
const stableProjectAnnotationsSetupFile = resolve(process.cwd(), 'web/.storybook/vitest.setup.ts')
// '@vouchington/html-utils', '@vouchington/phone-validation', '@vouchington/utils', 'uuid', and
// '@vouchington/session-jwt' are not direct web dependencies — they're pulled in transitively via
// '@ts-shared/utils' and '@ts-shared/session-jwt'. Nested Vite specifiers tell optimizeDeps to resolve each bare import
// through that specific parent package instead of requiring a direct declaration in web/package.json.
// Published `@vouchington/*` and first-party-exemption dependencies of those nested-include
// parents must also appear here. Vite otherwise rediscovers them after the first optimize
// pass, reloads, and aborts the virtual project-annotations import (issue #10042).
const transformWorkspaceMts = {
  name: `transform-storybook-browser-workspace-mts`,
  enforce: 'pre',
  async transform(code: string, id: string) {
    if (!id.endsWith('.mts') || !code.includes('with { type:')) return null

    return code.replace(
      /(^|\n)(\s*import\s+(?:[^"'\n]*\s+from\s+)?['"][^'"\n]+['"])\s+with\s+\{\s*type:\s*['"]json['"]\s*\}/g,
      '$1$2',
    )
  },
} as const

export const stripJsonImportAttributes = (code: string): string =>
  code.replace(/\s+(?:assert|with)\s*\{\s*type\s*:\s*(['"])json\1\s*\}/g, '')

type SetupFileConfig = {
  test?: {
    setupFiles?: string | string[]
  }
}

const isAddonProjectAnnotationsSetupFile = (setupFile: string): boolean => {
  const normalized = setupFile.replace(/\\/g, '/')
  return (
    normalized.includes('/@storybook/addon-vitest/') &&
    normalized.endsWith('/setup-file-with-project-annotations.js')
  )
}

// Two invariants must always hold for the web-storybook-browser Vitest project:
//
// 1. Chromium must fetch web/.storybook/vitest.setup.ts (not the addon-generated
//    setup-file-with-project-annotations.js) — replaceAddonProjectAnnotationsSetupFile
//    enforces this by swapping the addon's generated path for our stable file.
//
// 2. web/.storybook/vitest.setup.ts must not contain the literal strings
//    `setProjectAnnotations`, `Found a setup file`, or `Skipping automatic provisioning` —
//    Storybook scans setup files for those strings and, when found, emits a
//    duplicate-annotation warning (because our file already calls the API via a split
//    template literal). See ci/storybook-setup-file-detector-guard.test.mts.
const replaceAddonProjectAnnotationsSetupFile = (config: SetupFileConfig): void => {
  const test = config.test
  const setupFiles = test?.setupFiles
  if (!test || !setupFiles) return

  if (Array.isArray(setupFiles)) {
    test.setupFiles = setupFiles.map(setupFile =>
      isAddonProjectAnnotationsSetupFile(setupFile) ? stableProjectAnnotationsSetupFile : setupFile,
    )
  } else if (isAddonProjectAnnotationsSetupFile(setupFiles)) {
    test.setupFiles = stableProjectAnnotationsSetupFile
  }
}

export const storybookBrowserProject: TestProjectConfiguration = {
  extends: true as const,
  root: 'web',
  plugins: isStorybookBrowserEnabled
    ? [
        {
          name: `suppress-storybook-include-warning`,
          enforce: 'pre' as const,
          config(c: { test?: { include?: unknown[] } }) {
            if (c.test) c.test.include = []
          },
        },
        {
          name: `strip-json-import-attributes`,
          enforce: 'pre' as const,
          transform(code, id) {
            if (!/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) return null
            const stripped = stripJsonImportAttributes(code)
            return stripped === code ? null : { code: stripped, map: null }
          },
        },
        storybookTest({ configDir: resolve(process.cwd(), 'web/.storybook') }),
        react(),
        {
          name: `reset-base`,
          enforce: 'post' as const,
          config: () => ({ base: '/', cacheDir: storybookBrowserCacheDir }),
          configResolved: applyStorybookBrowserOptimizeDeps,
        },
        {
          name: `stable-storybook-project-annotations-setup`,
          enforce: 'post' as const,
          config(config) {
            replaceAddonProjectAnnotationsSetupFile(config)
          },
        },
        transformWorkspaceMts,
      ]
    : [
        {
          // When browser mode is off, clear the include list so story files are never
          // selected by the test-impact analyzer or run by the vitest runner.
          name: `clear-storybook-include`,
          enforce: 'pre' as const,
          config(c: { test?: { include?: unknown[] } }) {
            if (c.test) c.test.include = []
          },
        },
      ],
  resolve: {
    alias: [
      ...storybookMockResolveAliases,
      { find: 'storybook/internal/preview-api', replacement: storybookPreviewApiPath },
      ...Object.entries(webAlias).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  define: {
    'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(''),
  },
  server: {
    warmup: {
      clientFiles: ['storybook/**/*.stories.{ts,tsx}', storybookPreviewApiPath],
    },
  },
  test: {
    name: 'web-storybook-browser',
    maxWorkers: parseStorybookBrowserMaxWorkers(),
    include: ['storybook/**/*.stories.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.git/**', 'node_modules/**', '.next/**'],
    // Must stay a literal relative path (no `resolve(process.cwd(), ...)`) so `no-mistakes` can
    // trace this as a static `vitest-setup` dependency edge instead of falling back to a global
    // full-suite selection for any change reachable through the web-storybook-browser project
    // graph. No-mistakes resolves this literal relative to the repo root
    // (test-helpers/vitest.setup.storybook-browser-guard.mts); Vitest resolves the same literal
    // relative to this project's own `root: 'web'` override
    // (web/test-helpers/vitest.setup.storybook-browser-guard.mts). Both are redirect shims to the
    // real implementation at web/.storybook/vitest.setup.ts — see those files' comments and
    // docs/development/ci.md.
    setupFiles: ['./test-helpers/vitest.setup.storybook-browser-guard.mts'],
    // Share one module context so the virtual annotations module is fetched once
    // per browser session; isolated story files restored the setup-file flake.
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    api: { port: parseStorybookBrowserApiPort() },
    browser: {
      enabled: isStorybookBrowserEnabled,
      headless: true,
      connectTimeout: storybookBrowserConnectionTimeoutMs,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' as const }],
    },
  },
}
